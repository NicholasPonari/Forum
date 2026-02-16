import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainIdentityManager } from "@/lib/blockchain/identity-manager";

/**
 * GET /api/blockchain/verify-profile?userId=...
 *
 * Verifies that a user's core profile fields have not been tampered with
 * since their blockchain identity was issued.
 *
 * Re-computes the profile hash from current DB fields and compares it
 * against the stored profile_hash in blockchain_identities.
 *
 * Query params:
 *   - userId: The user ID to verify (optional — defaults to authenticated user)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    let userId = searchParams.get("userId");

    // If no userId provided, use the authenticated user
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: "Provide ?userId= or authenticate" },
          { status: 400 },
        );
      }
      userId = user.id;
    }

    // 1. Fetch the blockchain identity record (includes stored profile_hash)
    const { data: identity, error: identityError } = await supabase
      .from("blockchain_identities")
      .select(
        "id, identity_hash, status, profile_hash, verification_attempt_id, tx_hash, block_number, issued_at",
      )
      .eq("user_id", userId)
      .single();

    if (identityError || !identity) {
      return NextResponse.json({
        verified: false,
        status: "no_identity",
        message: "No blockchain identity found for this user.",
      });
    }

    if (!identity.profile_hash) {
      return NextResponse.json({
        verified: false,
        status: "no_profile_hash",
        message:
          "Blockchain identity exists but was issued before profile hashing was enabled. Re-issuance recommended.",
        identity: {
          identityHash: identity.identity_hash,
          status: identity.status,
          txHash: identity.tx_hash,
          issuedAt: identity.issued_at,
        },
      });
    }

    // 2. Fetch current profile fields
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, coord, type, verified")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      );
    }

    // 3. Re-compute profile hash from current DB state
    const manager = getBlockchainIdentityManager();

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

    const currentHash = manager.computeProfileHash(
      userId,
      profile.first_name || "",
      profile.last_name || "",
      parsedCoord,
      profile.type || "Resident",
      profile.verified ?? false,
    );

    // 4. Compare
    const tampered = currentHash !== identity.profile_hash;

    // 5. Log the verification (and flag tampering if detected)
    const auditAction = tampered ? "profile_tamper_detected" : "verify_profile";
    await supabase.from("blockchain_audit_log").insert({
      user_id: userId,
      action: auditAction,
      identity_hash: identity.identity_hash,
      metadata: {
        storedProfileHash: identity.profile_hash,
        currentProfileHash: currentHash,
        tampered,
        verificationAttemptId: identity.verification_attempt_id,
      },
    });

    return NextResponse.json({
      verified: !tampered && identity.status === "active",
      tampered,
      status: identity.status,
      identity: {
        identityHash: identity.identity_hash,
        txHash: identity.tx_hash,
        blockNumber: identity.block_number,
        issuedAt: identity.issued_at,
        verificationAttemptId: identity.verification_attempt_id,
      },
      hashes: {
        stored: identity.profile_hash,
        current: currentHash,
      },
    });
  } catch (error) {
    console.error("[VerifyProfile] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
