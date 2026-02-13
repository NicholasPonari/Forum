
import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";
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
    console.log("[useIssues] fetchIssuesAndVotes START", { start });
    setLoading(true);

    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesResult = await withTimeout<any>(
        supabase
          .from("issues")
          .select(
            `id, title, type, narrative, image_url, created_at, user_id, profiles (username, type, avatar_url, municipal_districts!profiles_municipal_district_id_fkey (city), provincial_districts!profiles_provincial_district_id_fkey (province)), location_lat, location_lng, address, video_url, media_type, federal_district, municipal_district, provincial_district, topic, government_level`
          )
          .order("created_at", { ascending: false })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .limit(50) as any,
        45000,
        "issues select"
      );
      const { data: issuesData, error: issuesError } = issuesResult ?? {};
      if (issuesError) {
        console.error("Error fetching issues:", issuesError);
      }

      // Attach username and user role to each issue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuesWithUsernames = (issuesData || []).map((issue: any) => {
        const profile = Array.isArray(issue.profiles)
          ? issue.profiles[0]
          : issue.profiles;
        const municipalDistrict = Array.isArray(profile?.municipal_districts)
          ? profile.municipal_districts[0]
          : profile?.municipal_districts;
        const provincialDistrict = Array.isArray(profile?.provincial_districts)
          ? profile.provincial_districts[0]
          : profile?.provincial_districts;
        return {
          ...issue,
          username: profile?.username || null,
          user_role: profile?.type || null,
          avatar_url: profile?.avatar_url || null,
          author_city: municipalDistrict?.city ?? null,
          author_province: provincialDistrict?.province ?? null,
        };
      });
      setIssues(issuesWithUsernames);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issueIds = issuesWithUsernames.map((issue: any) => issue.id);

      const voteMap: VoteMap = {};
      const breakdown: VoteBreakdown = {};
      for (const issueId of issueIds) {
        voteMap[issueId] = 0;
        breakdown[issueId] = { upvotes: 0, downvotes: 0 };
      }

      if (issueIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const votesResult = await withTimeout<any>(
          supabase
            .from("votes")
            .select("issue_id, value")
            .in("issue_id", issueIds) as any,
          45000,
          "votes select"
        );
        const { data: votesData, error: votesError } = votesResult ?? {};
        if (votesError) {
          console.error("Error fetching votes:", votesError);
        }
        if (votesData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const v of votesData as any[]) {
            const issueId =
              typeof v.issue_id === "string"
                ? parseInt(v.issue_id)
                : v.issue_id;
            if (voteMap[issueId] === undefined) continue;
            voteMap[issueId] += v.value;
            if (v.value === 1) breakdown[issueId].upvotes += 1;
            if (v.value === -1) breakdown[issueId].downvotes += 1;
          }
        }
      }
      setVotes(voteMap);
      setVoteBreakdown(breakdown);

      // Fetch comments count for each issue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commentsResult = await withTimeout<any>(
        issueIds.length > 0
          ? (supabase
              .from("comments")
              .select("issue_id")
              .in("issue_id", issueIds) as any)
          : Promise.resolve({ data: [], error: null }),
        45000,
        "comments select"
      );
      const { data: commentsData, error: commentsError } = commentsResult ?? {};
      if (commentsError) {
        console.error("Error fetching comments count:", commentsError);
      }

      const commentsCountMap: CommentsCountMap = {};
      for (const issue of issuesWithUsernames) {
        commentsCountMap[issue.id] = 0;
      }

      if (commentsData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const comment of commentsData as any[]) {
          const issueId = parseInt(comment.issue_id);
          if (commentsCountMap[issueId] !== undefined) {
            commentsCountMap[issueId]++;
          }
        }
      }

      setCommentsCount(commentsCountMap);
    } catch (error) {
      console.error("[useIssues] Error loading issues feed:", error);
    } finally {
      const end = Date.now();
      console.log("[useIssues] fetchIssuesAndVotes END", { end, duration: end - start });
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
