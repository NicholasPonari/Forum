"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { createClient } from "@/lib/supabaseClient";
import { ArrowBigUp, ArrowBigDown } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

interface VoteButtonsProps {
	issueId: number;
	initialVotes: number;
	upvotes?: number;
	downvotes?: number;
	onVoted?: () => void;
	onRequireVerification?: () => void;
	onMemberRestricted?: () => void;
}

export function VoteButtons({
	issueId,
	upvotes: initialUpvotes = 0,
	downvotes: initialDownvotes = 0,
	onVoted,
	onRequireVerification,
	onMemberRestricted,
}: VoteButtonsProps) {
	const { user, isMember } = useAuth();
	const { t } = useTranslation();
	const [upvotes, setUpvotes] = useState(initialUpvotes);
	const [downvotes, setDownvotes] = useState(initialDownvotes);
	const [userVote, setUserVote] = useState<1 | -1 | 0>(0);

	const vote = async (value: 1 | -1) => {
		if (!user) {
			if (onRequireVerification) {
				onRequireVerification();
				return;
			}
			toast(t.vote.loginToVote);
			return;
		}
		if (isMember) {
			if (onMemberRestricted) {
				onMemberRestricted();
				return;
			}
			toast(t.vote.membersCannotVote);
			return;
		}
		if (userVote === value) return;
		const supabase = createClient();
		// Upsert vote (insert or update)
		const { error } = await supabase.from("votes").upsert(
			{
				issue_id: issueId,
				user_id: user.id,
				value,
			},
			{ onConflict: "user_id,issue_id" }
		);
		if (error) {
			toast(t.vote.error);
			return;
		}

		// Record on blockchain (optimistic, don't await)
		fetch("/api/blockchain/record-content", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contentId: issueId,
				contentType: "vote",
			}),
		}).catch(err => console.error("Failed to record vote on chain:", err));

		// Refetch upvote/downvote counts and user vote
		const [{ data: voteData }, { data: userVoteData }] = await Promise.all([
			supabase.from("votes").select("value").eq("issue_id", issueId),
			supabase
				.from("votes")
				.select("value")
				.eq("issue_id", issueId)
				.eq("user_id", user.id)
				.single(),
		]);
		if (voteData) {
			setUpvotes(voteData.filter((v) => v.value === 1).length);
			setDownvotes(voteData.filter((v) => v.value === -1).length);
		}
		if (userVoteData) {
			setUserVote(userVoteData.value);
		}
		if (onVoted) onVoted();
	};

	const netVotes = upvotes - downvotes;

	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				className={`p-1 rounded transition-colors ${
					userVote === 1
						? "bg-orange-100 text-orange-600"
						: "text-gray-400 hover:text-orange-600 hover:bg-orange-50"
				} disabled:opacity-60`}
				onClick={() => vote(1)}
				aria-label={t.vote.upvote}
			>
				<ArrowBigUp className="w-4 h-4" />
			</button>

			<span
				className={`text-xs font-bold min-w-[20px] text-center ${
					netVotes > 0
						? "text-orange-600"
						: netVotes < 0
						? "text-blue-600"
						: "text-gray-500"
				}`}
			>
				{netVotes}
			</span>

			<button
				type="button"
				className={`p-1 rounded transition-colors ${
					userVote === -1
						? "bg-blue-100 text-blue-600"
						: "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
				} disabled:opacity-60`}
				onClick={() => vote(-1)}
				aria-label={t.vote.downvote}
			>
				<ArrowBigDown className="w-4 h-4" />
			</button>
		</div>
	);
}
