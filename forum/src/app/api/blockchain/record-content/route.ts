import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabaseServer";
import { getBlockchainContentManager } from "@/lib/blockchain/content-manager";

/**
 * POST /api/blockchain/record-content
 *
 * Records user-generated content (Issue, Comment, Vote) on the blockchain.
 *
 * Body: { 
 *   contentId: string, 
 *   contentType: "issue" | "comment" | "vote" 
 * }
 *
 * Security:
 * - Requires authenticated Supabase session.
 * - Verifies the content exists in Supabase and belongs to (or was cast by) the authenticated user.
 * - Computes the hash server-side to ensure integrity.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const serviceSupabase = await createServiceRoleSupabaseClient();

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
    const { contentId, contentType } = body;

    if (!contentId || !contentType) {
      return NextResponse.json(
        { error: "Missing required fields: contentId, contentType" },
        { status: 400 }
      );
    }

    // 3. Verify content ownership and fetch data for hashing
    let contentHash = "";
    let contentCreatedAt = "";
    let targetContentId = contentId;

    if (contentType === "issue") {
      const { data: issue, error } = await supabase
        .from("issues")
        .select("*")
        .eq("id", contentId)
        .single();

      if (error || !issue) {
        return NextResponse.json({ error: "Issue not found" }, { status: 404 });
      }
      if (issue.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden: Not your issue" }, { status: 403 });
      }

      contentHash = getBlockchainContentManager().computeIssueHash(
        issue.id.toString(),
        issue.title,
        issue.narrative,
        issue.type,
        issue.topic,
        issue.user_id,
        issue.created_at
      );
      contentCreatedAt = issue.created_at;

    } else if (contentType === "comment") {
      const { data: comment, error } = await supabase
        .from("comments")
        .select("*")
        .eq("id", contentId)
        .single();

      if (error || !comment) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }
      if (comment.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden: Not your comment" }, { status: 403 });
      }

      contentHash = getBlockchainContentManager().computeCommentHash(
        comment.id,
        comment.content,
        comment.issue_id,
        comment.user_id,
        comment.created_at
      );
      contentCreatedAt = comment.created_at;

    } else if (contentType === "vote") {
        // Client passes issueId as contentId for votes; we look up by (issue_id, user_id)
        const { data: vote, error } = await supabase
            .from("votes")
            .select("*")
            .eq("issue_id", contentId)
            .eq("user_id", user.id)
            .single();

        if (error || !vote) {
             return NextResponse.json({ error: "Vote not found" }, { status: 404 });
        }

        contentHash = getBlockchainContentManager().computeVoteHash(
            vote.issue_id.toString(),
            vote.user_id,
            vote.value,
            vote.updated_at || vote.created_at
        );
        contentCreatedAt = vote.created_at;
        // Use the vote row's own ID as the blockchain content key (avoids collision with issue ID)
        targetContentId = vote.id;

    } else if (contentType === "comment_vote") {
        // Client passes commentId as contentId for comment votes
        const { data: vote, error } = await supabase
            .from("comment_votes")
            .select("*")
            .eq("comment_id", contentId)
            .eq("user_id", user.id)
            .single();

        if (error || !vote) {
             return NextResponse.json({ error: "Comment vote not found" }, { status: 404 });
        }

        contentHash = getBlockchainContentManager().computeCommentVoteHash(
            vote.comment_id,
            vote.user_id,
            vote.value,
            vote.updated_at || vote.created_at
        );
        contentCreatedAt = vote.created_at;
        targetContentId = vote.id;

    } else {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    // 4. Check if already recorded (SKIP for now to allow edits/re-recording, or check hash?)
    // If we want to prevent duplicate recording of the SAME state, we check if the LATEST record has the same hash.
    const { data: latestRecord } = await supabase
      .from("blockchain_content_records")
      .select("content_hash, status")
      .eq("content_id", targetContentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestRecord && latestRecord.status === 'verified' && latestRecord.content_hash === contentHash) {
      return NextResponse.json({ 
        success: true, 
        message: "Content already verified with current state", 
      });
    }

    // 5. Get User's Identity Hash (required for linking)
    const { data: identity } = await supabase
        .from("blockchain_identities")
        .select("identity_hash")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();
    
    if (!identity) {
        return NextResponse.json({ error: "User has no verified blockchain identity" }, { status: 400 });
    }

    // 6. Record on Blockchain
    const manager = getBlockchainContentManager();
    const recordId = crypto.randomUUID(); // Generate unique ID for this specific record/version
    let result;

    try {
        result = await manager.recordContent(
            recordId, // Use the unique Record ID as the key on-chain
            contentHash,
            identity.identity_hash,
            contentType
        );
    } catch (err: any) {
        console.error("Blockchain record failed:", err);
        
        // Log failure
        await serviceSupabase.from("blockchain_audit_log").insert({
            user_id: user.id,
            action: "record_content_failed",
            error_message: err.message,
            metadata: { contentId: targetContentId, contentType }
        });

        return NextResponse.json({ 
            error: "Blockchain transaction failed", 
            details: err.message 
        }, { status: 502 });
    }

    // 7. Save record to DB (includes user_id for direct audit traceability)
    const { error: dbError } = await serviceSupabase.from("blockchain_content_records").insert({
        id: recordId,
        content_id: targetContentId,
        content_type: contentType,
        content_hash: result.contentHash,
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        user_id: user.id,
        status: 'verified'
    });

    if (dbError) {
        console.error("DB insert failed for content record:", dbError);
        await serviceSupabase.from("blockchain_audit_log").insert({
            user_id: user.id,
            action: "record_content_failed",
            error_message: `On-chain OK but DB insert failed: ${dbError.message}`,
            metadata: { txHash: result.txHash, contentId: targetContentId, contentType }
        });

        return NextResponse.json({
            error: "Content recorded on-chain but database record failed",
            txHash: result.txHash,
            retryable: true,
        }, { status: 500 });
    }

    // 8. Log success (only when both on-chain and DB succeeded)
    await serviceSupabase.from("blockchain_audit_log").insert({
        user_id: user.id,
        action: "record_content",
        tx_hash: result.txHash,
        metadata: { 
            contentId: targetContentId, 
            contentType, 
            blockNumber: result.blockNumber 
        }
    });

    return NextResponse.json({
        success: true,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contentHash: result.contentHash
    });

  } catch (error) {
    console.error("Unexpected error in record-content:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
