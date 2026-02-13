import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainIdentityManager } from "@/lib/blockchain/identity-manager";

/**
 * GET /api/blockchain/status?hash={identityHash}
 *
 * Verifies an identity on-chain. Read-only — no gas cost.
 *
 * Query params:
 *   - hash: The identity hash to verify (required)
 *
 * If no hash is provided but the user is authenticated, looks up
 * their identity hash from the database.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let identityHash = searchParams.get("hash");

    const supabase = await createServerSupabaseClient();

    // If no hash provided, look up the authenticated user's identity
    if (!identityHash) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: "Provide ?hash= or authenticate to look up your identity" },
          { status: 400 },
        );
      }

      const { data: blockchainIdentity } = await supabase
        .from("blockchain_identities")
        .select(
          "identity_hash, status, issued_at, tx_hash, block_number, chain_id",
        )
        .eq("user_id", user.id)
        .single();

      if (!blockchainIdentity) {
        return NextResponse.json({
          exists: false,
          onChain: null,
          database: null,
        });
      }

      const resolvedHash = blockchainIdentity.identity_hash;

      if (!resolvedHash) {
        return NextResponse.json({
          exists: false,
          onChain: null,
          database: {
            identityHash: null,
            status: blockchainIdentity.status,
            issuedAt: blockchainIdentity.issued_at,
            txHash: blockchainIdentity.tx_hash,
            blockNumber: blockchainIdentity.block_number,
            chainId: blockchainIdentity.chain_id,
          },
          onChainError: "Identity hash missing from database record",
        });
      }

      // Verify on-chain
      const manager = getBlockchainIdentityManager();
      let onChainResult;

      try {
        onChainResult = await manager.verifyOnChainIdentity(resolvedHash);
      } catch {
        // Blockchain node may be unreachable — return DB data only
        return NextResponse.json({
          exists: true,
          onChain: null,
          onChainError: "Blockchain node unreachable",
          database: {
            identityHash: blockchainIdentity.identity_hash,
            status: blockchainIdentity.status,
            issuedAt: blockchainIdentity.issued_at,
            txHash: blockchainIdentity.tx_hash,
            blockNumber: blockchainIdentity.block_number,
            chainId: blockchainIdentity.chain_id,
          },
        });
      }

      // Log the verification
      await supabase.from("blockchain_audit_log").insert({
        user_id: user.id,
        action: "verify",
        identity_hash: identityHash,
        metadata: { source: "authenticated_user", onChainResult },
      });

      return NextResponse.json({
        exists: onChainResult.exists,
        verified: onChainResult.exists && !onChainResult.revoked,
        onChain: onChainResult,
        database: {
          identityHash: blockchainIdentity.identity_hash,
          status: blockchainIdentity.status,
          issuedAt: blockchainIdentity.issued_at,
          txHash: blockchainIdentity.tx_hash,
          blockNumber: blockchainIdentity.block_number,
          chainId: blockchainIdentity.chain_id,
        },
      });
    }

    // Hash was provided directly — verify on-chain
    if (!identityHash) {
      return NextResponse.json(
        { error: "Identity hash is required" },
        { status: 400 },
      );
    }

    const manager = getBlockchainIdentityManager();

    let onChainResult;
    try {
      onChainResult = await manager.verifyOnChainIdentity(identityHash);
    } catch {
      return NextResponse.json(
        { error: "Blockchain node unreachable" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      exists: onChainResult.exists,
      verified: onChainResult.exists && !onChainResult.revoked,
      onChain: onChainResult,
    });
  } catch (error) {
    console.error("[BlockchainStatus] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/blockchain/status (no params, but POST for health check)
 *
 * Returns the health status of the blockchain infrastructure.
 */
export async function POST() {
  try {
    const manager = getBlockchainIdentityManager();
    const health = await manager.healthCheck();

    return NextResponse.json({
      healthy: health.nodeConnected && health.contractDeployed,
      ...health,
    });
  } catch (error) {
    console.error("[BlockchainStatus] Health check error:", error);
    return NextResponse.json(
      {
        healthy: false,
        error: "Health check failed",
      },
      { status: 503 },
    );
  }
}
