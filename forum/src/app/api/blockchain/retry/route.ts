import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainIdentityManager } from "@/lib/blockchain/identity-manager";
import { getBlockchainContentManager } from "@/lib/blockchain/content-manager";

/**
 * POST /api/blockchain/retry
 *
 * Retries failed blockchain operations for the authenticated user.
 *
 * Body: { type: "identity" | "content", contentId?: string, contentType?: string }
 *
 * - "identity": Re-issues blockchain identity if the previous attempt failed.
 * - "content": Re-records a specific piece of content on the blockchain.
 *
 * Security:
 * - Requires authenticated Supabase session
 * - Users can only retry their own failed operations
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Verify auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await request.json();
    const { type } = body;

    if (!type || !["identity", "content"].includes(type)) {
      return NextResponse.json(
        { error: 'Missing or invalid type. Must be "identity" or "content".' },
        { status: 400 },
      );
    }

    // ─── Retry Identity Issuance ───
    if (type === "identity") {
      // Check if user has a failed or pending_retry identity
      const { data: existingIdentity } = await supabase
        .from("blockchain_identities")
        .select("id, status")
        .eq("user_id", user.id)
        .single();

      if (existingIdentity && existingIdentity.status === "active") {
        return NextResponse.json(
          { error: "Blockchain identity already active", existing: true },
          { status: 409 },
        );
      }

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, verified, type, verification_attempt_id, first_name, last_name, coord",
        )
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        return NextResponse.json(
          { error: "Profile not found" },
          { status: 404 },
        );
      }

      if (!profile.verified || !profile.verification_attempt_id) {
        return NextResponse.json(
          { error: "Profile is not verified" },
          { status: 403 },
        );
      }

      // Issue on-chain
      const manager = getBlockchainIdentityManager();
      const email = user.email || "";

      let result;
      try {
        result = await manager.issueIdentity(
          user.id,
          email,
          profile.verification_attempt_id,
        );
      } catch (blockchainError: unknown) {
        const errorMessage =
          blockchainError instanceof Error
            ? blockchainError.message
            : "Unknown blockchain error";

        await supabase.from("blockchain_audit_log").insert({
          user_id: user.id,
          action: "issue_failed",
          error_message: `Retry failed: ${errorMessage}`,
          metadata: {
            verificationAttemptId: profile.verification_attempt_id,
            isRetry: true,
          },
        });

        return NextResponse.json(
          { error: "Blockchain transaction failed on retry", retryable: true },
          { status: 502 },
        );
      }

      // Compute profile hash
      let parsedCoord: { lat: number; lng: number } | null = null;
      if (profile.coord) {
        try {
          parsedCoord =
            typeof profile.coord === "string"
              ? JSON.parse(profile.coord)
              : profile.coord;
        } catch {
          parsedCoord = null;
        }
      }

      const profileHash = manager.computeProfileHash(
        user.id,
        profile.first_name || "",
        profile.last_name || "",
        parsedCoord,
        profile.type || "Resident",
        profile.verified ?? false,
      );

      // Upsert identity record
      const { error: insertError } = await supabase
        .from("blockchain_identities")
        .upsert({
          user_id: user.id,
          identity_hash: result.identityHash,
          issuer_signature: result.issuerSignature,
          tx_hash: result.txHash,
          block_number: result.blockNumber,
          contract_address: result.contractAddress,
          chain_id: result.chainId,
          status: "active",
          issued_at: new Date().toISOString(),
          verification_attempt_id: profile.verification_attempt_id,
          profile_hash: profileHash,
        });

      if (insertError) {
        await supabase.from("blockchain_audit_log").insert({
          user_id: user.id,
          action: "issue_failed",
          identity_hash: result.identityHash,
          tx_hash: result.txHash,
          error_message: `Retry: On-chain OK but DB insert failed: ${insertError.message}`,
          metadata: { ...result, dbInsertFailed: true, isRetry: true },
        });

        return NextResponse.json(
          {
            error: "Identity issued on-chain but database record failed",
            txHash: result.txHash,
            retryable: true,
          },
          { status: 500 },
        );
      }

      // Update profile
      await supabase
        .from("profiles")
        .update({ blockchain_verified: true })
        .eq("id", user.id);

      // Log success
      await supabase.from("blockchain_audit_log").insert({
        user_id: user.id,
        action: "issue",
        identity_hash: result.identityHash,
        tx_hash: result.txHash,
        metadata: {
          blockNumber: result.blockNumber,
          contractAddress: result.contractAddress,
          chainId: result.chainId,
          verificationAttemptId: profile.verification_attempt_id,
          profileHash,
          isRetry: true,
        },
      });

      return NextResponse.json({
        success: true,
        type: "identity",
        txHash: result.txHash,
        blockNumber: result.blockNumber,
      });
    }

    // ─── Retry Content Recording ───
    if (type === "content") {
      const { contentId, contentType } = body;

      if (!contentId || !contentType) {
        return NextResponse.json(
          { error: "Missing contentId or contentType for content retry" },
          { status: 400 },
        );
      }

      // Delegate to the record-content endpoint logic by calling it internally
      // This avoids duplicating all the content-type-specific logic
      const internalUrl = new URL(
        "/api/blockchain/record-content",
        request.url,
      );
      const internalResponse = await fetch(internalUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ contentId, contentType }),
      });

      const result = await internalResponse.json();

      if (!internalResponse.ok) {
        return NextResponse.json(
          { error: "Content retry failed", details: result },
          { status: internalResponse.status },
        );
      }

      return NextResponse.json({
        success: true,
        type: "content",
        ...result,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("[BlockchainRetry] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
