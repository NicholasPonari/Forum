import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainIdentityManager } from "@/lib/blockchain/identity-manager";

/**
 * POST /api/blockchain/issue-identity
 *
 * Issues an on-chain digital identity for a verified user.
 * Called after successful identity verification + profile creation.
 *
 * Body: { userId: string, verificationAttemptId: string }
 *
 * Security:
 * - Requires authenticated Supabase session
 * - User must have a verified profile
 * - One identity per user (enforced by DB unique constraint + smart contract)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Verify the caller is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { userId, verificationAttemptId } = body;

    if (!userId || !verificationAttemptId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, verificationAttemptId" },
        { status: 400 },
      );
    }

    // 3. Ensure the authenticated user matches the requested userId
    if (user.id !== userId) {
      return NextResponse.json(
        { error: "Forbidden: user ID mismatch" },
        { status: 403 },
      );
    }

    // 4. Verify user has a verified profile and fetch core fields for profile hashing
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, verified, type, verification_attempt_id, first_name, last_name, coord")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.verified) {
      return NextResponse.json(
        { error: "Profile is not verified" },
        { status: 403 },
      );
    }

    // 5. Check if blockchain identity already exists
    const { data: existingIdentity } = await supabase
      .from("blockchain_identities")
      .select("id, status")
      .eq("user_id", userId)
      .single();

    if (existingIdentity && existingIdentity.status === "active") {
      return NextResponse.json(
        { error: "Blockchain identity already exists", existing: true },
        { status: 409 },
      );
    }

    // 6. Issue identity on-chain
    const manager = getBlockchainIdentityManager();
    const email = user.email || "";

    let result;
    try {
      result = await manager.issueIdentity(
        userId,
        email,
        verificationAttemptId,
      );
    } catch (blockchainError: unknown) {
      const errorMessage =
        blockchainError instanceof Error
          ? blockchainError.message
          : "Unknown blockchain error";

      console.error("[BlockchainIdentity] Issue failed:", errorMessage);

      // Log the failure
      await supabase.from("blockchain_audit_log").insert({
        user_id: userId,
        action: "issue_failed",
        identity_hash: null,
        tx_hash: null,
        error_message: errorMessage,
        metadata: { verificationAttemptId },
      });

      return NextResponse.json(
        {
          error: "Blockchain transaction failed",
          detail: errorMessage,
          retryable: true,
        },
        { status: 502 },
      );
    }

    // 7. Compute profile hash to detect future tampering of core identity fields
    let parsedCoord: { lat: number; lng: number } | null = null;
    if (profile.coord) {
      try {
        parsedCoord = typeof profile.coord === "string"
          ? JSON.parse(profile.coord)
          : profile.coord;
      } catch {
        parsedCoord = null;
      }
    }

    const profileHash = manager.computeProfileHash(
      userId,
      profile.first_name || "",
      profile.last_name || "",
      parsedCoord,
      profile.type || "Resident",
      profile.verified ?? false,
    );

    // 8. Store the blockchain identity record in the database
    const { error: insertError } = await supabase
      .from("blockchain_identities")
      .upsert({
        user_id: userId,
        identity_hash: result.identityHash,
        issuer_signature: result.issuerSignature,
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        contract_address: result.contractAddress,
        chain_id: result.chainId,
        status: "active",
        issued_at: new Date().toISOString(),
        verification_attempt_id: verificationAttemptId,
        profile_hash: profileHash,
      });

    if (insertError) {
      console.error(
        "[BlockchainIdentity] DB insert failed:",
        insertError.message,
      );
      // The on-chain identity exists, but the DB record failed.
      // Log for manual recovery.
      await supabase.from("blockchain_audit_log").insert({
        user_id: userId,
        action: "issue_failed",
        identity_hash: result.identityHash,
        tx_hash: result.txHash,
        error_message: `On-chain OK but DB insert failed: ${insertError.message}`,
        metadata: { ...result, dbInsertFailed: true },
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

    // 9. Update profile blockchain_verified flag
    await supabase
      .from("profiles")
      .update({ blockchain_verified: true })
      .eq("id", userId);

    // 10. Log the successful issuance
    await supabase.from("blockchain_audit_log").insert({
      user_id: userId,
      action: "issue",
      identity_hash: result.identityHash,
      tx_hash: result.txHash,
      metadata: {
        blockNumber: result.blockNumber,
        contractAddress: result.contractAddress,
        chainId: result.chainId,
        verificationAttemptId,
        profileHash,
      },
    });

    return NextResponse.json({
      success: true,
      identityHash: result.identityHash,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
    });
  } catch (error) {
    console.error("[BlockchainIdentity] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
