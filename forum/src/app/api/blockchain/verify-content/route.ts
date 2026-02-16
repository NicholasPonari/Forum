import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBlockchainContentManager } from "@/lib/blockchain/content-manager";

/**
 * GET /api/blockchain/verify-content
 *
 * Checks if content is verified on the blockchain and validates integrity.
 *
 * Query Params: ?contentId=...&contentType=...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get("contentId");
    const contentType = searchParams.get("contentType");

    if (!contentId || !contentType) {
      return NextResponse.json(
        { error: "Missing required params: contentId, contentType" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch the content from DB to compute current hash
    let dbHash = "";
    let contentExists = false;

    // TODO: Ideally refactor this fetching logic to be shared with record-content
    if (contentType === "issue") {
      const { data: issue } = await supabase
        .from("issues")
        .select("*")
        .eq("id", contentId)
        .single();
      
      if (issue) {
        contentExists = true;
        dbHash = getBlockchainContentManager().computeIssueHash(
            issue.id.toString(),
            issue.title,
            issue.narrative,
            issue.type,
            issue.topic,
            issue.user_id,
            issue.created_at
        );
      }
    } else if (contentType === "comment") {
      const { data: comment } = await supabase
        .from("comments")
        .select("*")
        .eq("id", contentId)
        .single();
      
      if (comment) {
        contentExists = true;
        dbHash = getBlockchainContentManager().computeCommentHash(
            comment.id,
            comment.content,
            comment.issue_id,
            comment.user_id,
            comment.created_at
        );
      }
    } else if (contentType === "vote") {
       // For votes, contentId is the vote ID
       const { data: vote } = await supabase
        .from("votes")
        .select("*")
        .eq("id", contentId)
        .single();
        
       if (vote) {
         contentExists = true;
         dbHash = getBlockchainContentManager().computeVoteHash(
             vote.issue_id.toString(),
             vote.user_id,
             vote.value,
             vote.updated_at || vote.created_at
         );
       }
    } else if (contentType === "comment_vote") {
       // For votes, contentId is the vote ID
       const { data: vote } = await supabase
        .from("comment_votes")
        .select("*")
        .eq("id", contentId)
        .single();
        
       if (vote) {
         contentExists = true;
         dbHash = getBlockchainContentManager().computeCommentVoteHash(
             vote.comment_id,
             vote.user_id,
             vote.value,
             vote.updated_at || vote.created_at
         );
       }
    }

    if (!contentExists) {
        return NextResponse.json({ error: "Content not found in database" }, { status: 404 });
    }

    // 2. Fetch the latest blockchain record from DB
    const { data: record } = await supabase
        .from("blockchain_content_records")
        .select("*")
        .eq("content_id", contentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (!record) {
        return NextResponse.json({ 
            verified: false, 
            status: "not_recorded",
            message: "This content has not been anchored to the blockchain." 
        });
    }

    // 3. Verify Integrity (DB Hash vs Recorded Hash)
    const isTampered = record.content_hash !== dbHash;

    // 4. Verify On-Chain (Optional but good for deep verification)
    // We trust our DB record of the hash if we trust the DB hasn't been modified in that table.
    // To be truly trustless, we should ask the blockchain node.
    let onChainStatus = { 
        exists: false, 
        isDeleted: false, 
        contentHash: "", 
        userIdentityHash: "", 
        timestamp: 0, 
        contentType: "" 
    };
    try {
        // Pass the RECORD ID (record.id), not the CONTENT ID
        onChainStatus = await getBlockchainContentManager().verifyContent(record.id);
    } catch (e) {
        console.error("Failed to verify on-chain:", e);
        // Fallback to DB record only if chain is unreachable?
        // Or report error.
    }

    return NextResponse.json({
        verified: !isTampered && onChainStatus.exists,
        tampered: isTampered,
        onChain: onChainStatus.exists,
        isDeleted: onChainStatus.isDeleted,
        txHash: record.tx_hash,
        blockNumber: record.block_number,
        timestamp: record.created_at,
        dbHash,
        recordedHash: record.content_hash,
        onChainHash: onChainStatus.contentHash
    });

  } catch (error) {
    console.error("Error in verify-content:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
