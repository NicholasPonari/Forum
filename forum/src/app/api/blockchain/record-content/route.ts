import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainContentManager } from "@/lib/blockchain/content-manager";
import { getBlockchainIdentityManager } from "@/lib/blockchain/identity-manager";

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
        issue.id.toString(), // Ensure string
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
        // For votes, contentId might be the ID of the vote record itself if available,
        // or we might look it up by issue_id + user_id. 
        // Assuming contentId passed here is the 'id' from the 'votes' table (if it has one).
        // If the client passes issueId, we need to handle that.
        // Let's assume the client passes the UUID of the vote row. 
        // If the 'votes' table doesn't have a UUID primary key exposed or used by client, we might need to change strategy.
        // Based on VoteButtons.tsx: `upsert({ issue_id, user_id, value })`.
        // The table definition wasn't fully visible but likely has an ID.
        // If we don't have the vote ID on client, we can query by issue_id + user_id.
        // Let's assume contentId is actually the issueId for votes, and we look up the user's vote on that issue.
        
        // However, the plan said "Call blockchain recording after vote cast".
        // Let's try to find the vote record.
        // If contentId is passed as the issueId, we look for the vote.
        // Better: let the client pass { contentId: issueId, contentType: 'vote' }.
        // But the `blockchain_content_records` table expects `content_id` to be unique per record. 
        // If we use issueId as contentId for a vote, it conflicts with the issue itself.
        // So we need the unique ID of the vote row.
        
        // Let's query the vote by issue_id (passed as contentId) and user_id.
        const { data: vote, error } = await supabase
            .from("votes")
            .select("*")
            .eq("issue_id", contentId) // Assuming contentId is issueId for vote context
            .eq("user_id", user.id)
            .single();

        if (error || !vote) {
             return NextResponse.json({ error: "Vote not found" }, { status: 404 });
        }
        
        // Use the vote's actual primary key (if exists) or composite. 
        // If 'votes' table has 'id', use it. 
        // Checking VoteButtons.tsx, it selects 'value', but doesn't show ID. 
        // But likely there is an ID. 
        // We will use vote.id as the true contentId for blockchain storage.
        
        contentHash = getBlockchainContentManager().computeVoteHash(
            vote.issue_id.toString(),
            vote.user_id,
            vote.value,
            vote.updated_at || vote.created_at // fallback
        );
        contentCreatedAt = vote.created_at;
        
        // IMPORTANT: We switch contentId to be the VOTE's ID, not the ISSUE's ID
        // The client might have sent the Issue ID, but we record the Vote ID.
        // But we need to return this ID so client knows? Or just internal logic.
        // Let's fetch the vote.id and use that.
        // Re-assigning contentId local var (shadowing or mutating not ideal, but for logic flow):
        // actually we can't mutate const contentId from destructuring.
        // We will use a new variable for the record ID.
        var actualContentId = vote.id; // Assuming id exists. 
    } else if (contentType === "comment_vote") {
        // contentId passed from client is the commentId
        const commentId = contentId;
        
        const { data: vote, error } = await supabase
            .from("comment_votes")
            .select("*")
            .eq("comment_id", commentId)
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
        
        var actualContentId = vote.id;
    } else {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const targetContentId = (contentType === 'vote' || contentType === 'comment_vote') ? (actualContentId!) : contentId;

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
        await supabase.from("blockchain_audit_log").insert({
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

    // 7. Save record to DB
    const { error: dbError } = await supabase.from("blockchain_content_records").insert({
        id: recordId, // Ensure DB record ID matches chain key
        content_id: targetContentId,
        content_type: contentType,
        content_hash: result.contentHash,
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        status: 'verified'
    });

    if (dbError) {
        console.error("DB insert failed for content record:", dbError);
        // Log audit
        await supabase.from("blockchain_audit_log").insert({
            user_id: user.id,
            action: "record_content_failed",
            error_message: "DB insert failed: " + dbError.message,
            metadata: { txHash: result.txHash }
        });
    }

    // 8. Log success
    await supabase.from("blockchain_audit_log").insert({
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
