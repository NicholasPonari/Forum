import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainContentManager } from "@/lib/blockchain/content-manager";
import { getBlockchainIdentityManager } from "@/lib/blockchain/identity-manager";

/**
 * POST /api/blockchain/integrity-check
 *
 * Batch-verifies content and profile hashes against the blockchain records.
 * Detects any tampering that may have occurred in the database.
 *
 * Body: {
 *   scope: "profiles" | "content" | "all",
 *   limit?: number  (default 50, max 200)
 * }
 *
 * Security:
 * - Requires authenticated Supabase session
 * - Only verified users can run integrity checks
 *
 * Returns a summary of checked items and any detected tampering.
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

    // 2. Verify the user is verified (only trusted users should run integrity checks)
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("verified")
      .eq("id", user.id)
      .single();

    if (!callerProfile?.verified) {
      return NextResponse.json(
        { error: "Only verified users can run integrity checks" },
        { status: 403 },
      );
    }

    // 3. Parse body
    const body = await request.json();
    const scope = body.scope || "all";
    const limit = Math.min(body.limit || 50, 200);

    const results: {
      profiles: {
        checked: number;
        tampered: number;
        items: Array<{
          userId: string;
          tampered: boolean;
          storedHash: string;
          currentHash: string;
        }>;
      };
      content: {
        checked: number;
        tampered: number;
        items: Array<{
          contentId: string;
          contentType: string;
          tampered: boolean;
          storedHash: string;
          currentHash: string;
        }>;
      };
    } = {
      profiles: { checked: 0, tampered: 0, items: [] },
      content: { checked: 0, tampered: 0, items: [] },
    };

    // ─── Profile Integrity Check ───
    if (scope === "profiles" || scope === "all") {
      const { data: identities } = await supabase
        .from("blockchain_identities")
        .select("user_id, profile_hash, identity_hash, status")
        .eq("status", "active")
        .not("profile_hash", "is", null)
        .limit(limit);

      if (identities && identities.length > 0) {
        const userIds = identities.map((i) => i.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, coord, type, verified")
          .in("id", userIds);

        if (profiles) {
          const manager = getBlockchainIdentityManager();
          const profileMap = new Map(profiles.map((p) => [p.id, p]));

          for (const identity of identities) {
            const profile = profileMap.get(identity.user_id);
            if (!profile) continue;

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
              identity.user_id,
              profile.first_name || "",
              profile.last_name || "",
              parsedCoord,
              profile.type || "Resident",
              profile.verified ?? false,
            );

            const tampered = currentHash !== identity.profile_hash;
            results.profiles.checked++;
            if (tampered) {
              results.profiles.tampered++;
              results.profiles.items.push({
                userId: identity.user_id,
                tampered: true,
                storedHash: identity.profile_hash!,
                currentHash,
              });
            }
          }
        }
      }
    }

    // ─── Content Integrity Check ───
    if (scope === "content" || scope === "all") {
      // Get the latest verified content record per content_id
      const { data: records } = await supabase
        .from("blockchain_content_records")
        .select("id, content_id, content_type, content_hash, status")
        .eq("status", "verified")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (records && records.length > 0) {
        const contentManager = getBlockchainContentManager();

        for (const record of records) {
          let currentHash = "";
          let found = false;

          try {
            if (record.content_type === "issue") {
              const { data: issue } = await supabase
                .from("issues")
                .select("*")
                .eq("id", record.content_id)
                .single();

              if (issue) {
                found = true;
                currentHash = contentManager.computeIssueHash(
                  issue.id.toString(),
                  issue.title,
                  issue.narrative,
                  issue.type,
                  issue.topic,
                  issue.user_id,
                  issue.created_at,
                );
              }
            } else if (record.content_type === "comment") {
              const { data: comment } = await supabase
                .from("comments")
                .select("*")
                .eq("id", record.content_id)
                .single();

              if (comment) {
                found = true;
                currentHash = contentManager.computeCommentHash(
                  comment.id,
                  comment.content,
                  comment.issue_id,
                  comment.user_id,
                  comment.created_at,
                );
              }
            } else if (record.content_type === "vote") {
              const { data: vote } = await supabase
                .from("votes")
                .select("*")
                .eq("id", record.content_id)
                .single();

              if (vote) {
                found = true;
                currentHash = contentManager.computeVoteHash(
                  vote.issue_id.toString(),
                  vote.user_id,
                  vote.value,
                  vote.updated_at || vote.created_at,
                );
              }
            } else if (record.content_type === "comment_vote") {
              const { data: vote } = await supabase
                .from("comment_votes")
                .select("*")
                .eq("id", record.content_id)
                .single();

              if (vote) {
                found = true;
                currentHash = contentManager.computeCommentVoteHash(
                  vote.comment_id,
                  vote.user_id,
                  vote.value,
                  vote.updated_at || vote.created_at,
                );
              }
            }
          } catch {
            // Skip items that fail to fetch
            continue;
          }

          if (!found) continue;

          const tampered = currentHash !== record.content_hash;
          results.content.checked++;
          if (tampered) {
            results.content.tampered++;
            results.content.items.push({
              contentId: record.content_id,
              contentType: record.content_type,
              tampered: true,
              storedHash: record.content_hash,
              currentHash,
            });
          }
        }
      }
    }

    // Log the integrity check
    const totalTampered =
      results.profiles.tampered + results.content.tampered;
    await supabase.from("blockchain_audit_log").insert({
      user_id: user.id,
      action: "integrity_check",
      metadata: {
        scope,
        limit,
        profilesChecked: results.profiles.checked,
        profilesTampered: results.profiles.tampered,
        contentChecked: results.content.checked,
        contentTampered: results.content.tampered,
      },
    });

    return NextResponse.json({
      success: true,
      totalChecked: results.profiles.checked + results.content.checked,
      totalTampered,
      clean: totalTampered === 0,
      results,
    });
  } catch (error) {
    console.error("[IntegrityCheck] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
