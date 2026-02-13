
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Issue,
  VoteMap,
  VoteBreakdown,
  CommentsCountMap,
} from "@/lib/types/db";

// Helper for timeouts
const withTimeout = async <T>(
  promiseLike: PromiseLike<T> | T,
  timeoutMs: number,
  label: string
): Promise<T> => {
  const promise = Promise.resolve(promiseLike as T);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timeout`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export function useIssues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [votes, setVotes] = useState<VoteMap>({});
  const [voteBreakdown, setVoteBreakdown] = useState<VoteBreakdown>({});
  const [commentsCount, setCommentsCount] = useState<CommentsCountMap>({});
  const [loading, setLoading] = useState(true);
  const initialFetchStartedRef = useRef(false);

  const fetchIssuesAndVotes = useCallback(async () => {
    const start = Date.now();
    setLoading(true);

    try {
		const res = await withTimeout(
			fetch("/api/issues/feed?limit=50"),
			45000,
			"issues feed",
		);

		if (!res.ok) {
			throw new Error(`issues feed http ${res.status}`);
		}

		const json = (await res.json()) as {
			issues: Issue[];
			votes: Array<{ issue_id: string; value: number }>;
			comments: Array<{ issue_id: string }>;
		};

		setIssues(json.issues || []);

		const voteMap: VoteMap = {};
		const breakdown: VoteBreakdown = {};
		const commentsCountMap: CommentsCountMap = {};

		for (const issue of json.issues || []) {
			voteMap[issue.id] = 0;
			breakdown[issue.id] = { upvotes: 0, downvotes: 0 };
			commentsCountMap[issue.id] = 0;
		}

		for (const v of json.votes || []) {
			const issueId =
				typeof v.issue_id === "string" ? parseInt(v.issue_id, 10) : v.issue_id;
			if (Number.isNaN(issueId)) continue;
			if (voteMap[issueId] === undefined) continue;
			voteMap[issueId] += v.value;
			if (v.value === 1) breakdown[issueId].upvotes += 1;
			if (v.value === -1) breakdown[issueId].downvotes += 1;
		}

		for (const c of json.comments || []) {
			const issueId =
				typeof c.issue_id === "string" ? parseInt(c.issue_id, 10) : c.issue_id;
			if (Number.isNaN(issueId)) continue;
			if (commentsCountMap[issueId] === undefined) continue;
			commentsCountMap[issueId] += 1;
		}

		setVotes(voteMap);
		setVoteBreakdown(breakdown);
		setCommentsCount(commentsCountMap);
    } catch (error) {
      console.error("[useIssues] Error loading issues feed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFetchStartedRef.current) return;
    initialFetchStartedRef.current = true;
    fetchIssuesAndVotes();
  }, [fetchIssuesAndVotes]);

  return {
    issues,
    votes,
    voteBreakdown,
    commentsCount,
    loading,
    refreshIssues: fetchIssuesAndVotes,
  };
}
