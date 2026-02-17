"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { X, ImageIcon, AlertCircle } from "lucide-react";
import { CommentItem, CommentNode } from "./Comment";
import { createNotificationsForComment } from "@/lib/notificationUtils";
import { Skeleton } from "./ui/skeleton";
import { useRouter } from "next/navigation";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "./ui/dialog";

interface Comment {
	id: string;
	user_id: string | null;
	issue_id: string;
	parent_id: string | null;
	content: string;
	image_url?: string | null;
	bias: string;
	created_at: string;
	profiles: {
		id: string;
		username: string;
		avatar_url: string;
		first_name: string;
		last_name: string;
	};
	children?: Comment[];
	// Voting data
	vote_count?: number;
	user_vote?: number | null;
}

interface CommentThreadProps {
	issueId: number;
	user_id?: string;
}


export function CommentThread({ issueId, user_id }: CommentThreadProps) {
	const { isMember } = useAuth();
	const [comments, setComments] = useState<Comment[]>([]);
	const [loading, setLoading] = useState(true);
	const [replyTo, setReplyTo] = useState<string | null>(null);
	const [replyContent, setReplyContent] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [selectedImage, setSelectedImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [replyBias, setReplyBias] = useState<"for" | "neutral" | "against">(
		"neutral"
	);
	const [memberCommentCount, setMemberCommentCount] = useState<number>(0);
	const [showMemberLimitDialog, setShowMemberLimitDialog] = useState(false);

	// UI state: collapsed/expanded main composer, sorting and searching
	const [showMainComposer, setShowMainComposer] = useState(false);
	const [sortBy] = useState<"new" | "old">("new");
	const [searchTerm] = useState("");
	const [collapsedComments, setCollapsedComments] = useState<Set<string>>(
		new Set()
	);
	const mainTextareaRef = useRef<HTMLTextAreaElement | null>(null);
	const [showSignupDialog, setShowSignupDialog] = useState(false);
	const router = useRouter();

	// Fetch member's comment count for current month (deprecated - no longer needed)
	const fetchMemberCommentCount = useCallback(async () => {
		// No-op - all users are now verified
	}, []);

	useEffect(() => {
		fetchComments();
		fetchMemberCommentCount();
		// eslint-disable-next-line
	}, [issueId, fetchMemberCommentCount]);

	// Focus textarea when opening main composer
	useEffect(() => {
		if (showMainComposer) {
			mainTextareaRef.current?.focus();
		}
	}, [showMainComposer]);
	const fetchComments = async () => {
		setLoading(true);
		const supabase = createClient();

		// Fetch comments with vote data
		const { data: commentsData, error } = await supabase
			.from("comments")
			.select(
				`id, user_id, user_id!inner(id, username, avatar_url, first_name, last_name), issue_id, parent_id, content, image_url, created_at, bias`
			)
			.eq("issue_id", issueId)
			.order("created_at", { ascending: true });

		if (error) {
			console.error("Error fetching comments:", error);
		}
		// Fetch vote counts for all comments
		const commentIds = (commentsData || []).map((c) => c.id);
		const { data: voteCounts } = await supabase
			.from("comment_votes")
			.select("comment_id, value")
			.in("comment_id", commentIds);

		// Fetch user's votes if logged in
		let userVotes: { comment_id: string; value: number }[] = [];
		if (user_id) {
			const { data } = await supabase
				.from("comment_votes")
				.select("comment_id, value")
				.eq("user_id", user_id)
				.in("comment_id", commentIds);
			userVotes = data || [];
		}

		// Calculate vote counts and user votes
		const voteCountMap: Record<string, number> = {};
		const userVoteMap: Record<string, number> = {};

		// Sum up vote counts
		(voteCounts || []).forEach((vote) => {
			voteCountMap[vote.comment_id] =
				(voteCountMap[vote.comment_id] || 0) + vote.value;
		});

		// Map user votes
		userVotes.forEach((vote) => {
			userVoteMap[vote.comment_id] = vote.value;
		});

		const normalizedData = (commentsData || []).map((comment) => ({
			...comment,
			profiles: Array.isArray(comment.user_id)
				? comment.user_id[0] || null
				: comment.user_id,
			user_id:
				typeof comment.user_id === "object" && comment.user_id !== null
					? comment.user_id.id
					: comment.user_id,
			vote_count: voteCountMap[comment.id] || 0,
			user_vote: userVoteMap[comment.id] || null,
		}));
		setComments(buildTree(normalizedData));
		setLoading(false);
	};

	// Build nested comment tree
	function buildTree(flat: Comment[]): Comment[] {
		const map: Record<string, Comment & { children: Comment[] }> = {};
		const roots: Comment[] = [];
		for (const c of flat) {
			map[c.id] = { ...c, children: [] };
		}
		for (const c of flat) {
			if (c.parent_id && map[c.parent_id]) {
				map[c.parent_id].children.push(map[c.id]);
			} else {
				roots.push(map[c.id]);
			}
		}
		return roots;
	}

	const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			setSelectedImage(file);
			const reader = new FileReader();
			reader.onload = (e) => {
				setImagePreview(e.target?.result as string);
			};
			reader.readAsDataURL(file);
		}
	};

	const removeImage = () => {
		setSelectedImage(null);
		setImagePreview(null);
	};

	const handleReply = (parentId: string | null) => {
		setReplyTo(parentId);
		setReplyContent("");
		setSelectedImage(null);
		setImagePreview(null);
		setReplyBias("neutral");
	};

	const handleToggleCollapse = (commentId: string) => {
		setCollapsedComments((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(commentId)) {
				newSet.delete(commentId);
			} else {
				newSet.add(commentId);
			}
			return newSet;
		});
	};

	const isCommentCollapsed = (commentId: string) => {
		return collapsedComments.has(commentId);
	};

	const submitReply = async (parentId: string | null) => {
		if (!replyContent.trim()) return;

	// No comment limit checks needed - all users are verified

		setSubmitting(true);
		const supabase = createClient();
		const {
			data: { user: authenticatedUser },
			error: authUserError,
		} = await supabase.auth.getUser();

		if (authUserError || !authenticatedUser) {
			console.error("Comment submit failed: missing authenticated user", authUserError);
			setSubmitting(false);
			return;
		}

		if (user_id && authenticatedUser.id !== user_id) {
			console.warn("CommentThread user/session mismatch detected", {
				propUserId: user_id,
				authenticatedUserId: authenticatedUser.id,
			});
		}

		const authorUserId = authenticatedUser.id;
		let image_url = null;

		// Handle image upload if present
		if (selectedImage) {
			// Sanitize filename by removing invalid characters
			const sanitizedName = selectedImage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
			const filePath = `comments/${Date.now()}-${sanitizedName}`;
			const { error: uploadError } = await supabase.storage
				.from("images")
				.upload(filePath, selectedImage, { contentType: selectedImage.type });
			if (uploadError) {
				console.error("Image upload failed:", uploadError);
				setSubmitting(false);
				return;
			}
			image_url = supabase.storage.from("images").getPublicUrl(filePath)
				.data.publicUrl;
		}

		const { data: newComment, error: insertError } = await supabase
			.from("comments")
			.insert({
				user_id: authorUserId,
				issue_id: issueId,
				parent_id: parentId,
				content: replyContent,
				image_url,
				bias: replyBias,
			})
			.select()
			.single();

		// Create notifications if comment was successfully created
		if (!insertError && newComment) {
			// Record on blockchain
			fetch("/api/blockchain/record-content", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contentId: newComment.id,
					contentType: "comment",
				}),
			})
				.then(async (res) => {
					if (!res.ok) {
						let payload: any = null;
						try {
							payload = await res.json();
						} catch {
							payload = null;
						}
						console.error("Failed to record comment on chain:", {
							status: res.status,
							payload,
						});
					}
				})
				.catch((err) =>
					console.error("Failed to record comment on chain:", err),
				);

			await createNotificationsForComment(
				supabase,
				newComment.id,
				issueId.toString(),
				parentId,
				authorUserId,
				replyContent
			);
		}

		setReplyContent("");
		setReplyTo(null);
		setSelectedImage(null);
		setImagePreview(null);
		setReplyBias("neutral");
		if (parentId === null) {
			setShowMainComposer(false);
		}
		setSubmitting(false);
		fetchComments();

		// No member comment count tracking needed
	};

	// Handle voting with optimistic UI updates
	const handleVote = async (commentId: string, value: number) => {
		if (!user_id) return;

		// All users can vote on comments

		const supabase = createClient();
		const {
			data: { user: authenticatedUser },
			error: authUserError,
		} = await supabase.auth.getUser();

		if (authUserError || !authenticatedUser) {
			console.error("Comment vote failed: missing authenticated user", authUserError);
			return;
		}

		if (user_id && authenticatedUser.id !== user_id) {
			console.warn("CommentThread user/session mismatch detected during vote", {
				propUserId: user_id,
				authenticatedUserId: authenticatedUser.id,
			});
		}

		const voterUserId = authenticatedUser.id;

		// Check if user already voted on this comment
		const { data: existingVote } = await supabase
			.from("comment_votes")
			.select("id, value")
			.eq("comment_id", commentId)
			.eq("user_id", voterUserId)
			.single();

		// Calculate the vote change for optimistic update
		let voteDelta = 0;
		let newUserVote: number | null = null;

		if (existingVote) {
			// If clicking the same vote, remove it
			if (existingVote.value === value) {
				voteDelta = -value; // Remove the vote
				newUserVote = null;
				await supabase.from("comment_votes").delete().eq("id", existingVote.id);
			} else {
				// Update existing vote (e.g., from upvote to downvote)
				voteDelta = value - existingVote.value; // e.g., -1 - 1 = -2
				newUserVote = value;
				await supabase
					.from("comment_votes")
					.update({ value })
					.eq("id", existingVote.id);
			}
		} else {
			// Create new vote
			voteDelta = value;
			newUserVote = value;
			await supabase.from("comment_votes").insert({
				comment_id: commentId,
				user_id: voterUserId,
				value: value,
			});
		}

		// Record vote on blockchain
		// For comment votes, we treat the commentId as the contentId context, 
		// but the backend will look up the vote record by (commentId/issueId, userId)
		// Wait, the backend logic for 'vote' type assumes contentId is the ISSUE ID.
		// If we pass a COMMENT ID, the backend needs to handle "comment_vote".
		// Currently backend only supports "vote" which looks up in "votes" table (issue votes).
		// We need to update backend to support "comment_vote" OR handle it here.
		
		// Let's stick to the plan: "votes" usually refers to issue votes. 
		// If we want comment votes verified, we need to extend the system.
		// For now, let's comment this out or implement "comment_vote" in backend.
		// The prompt asked for "upvotes/downvotes on chain, comments, replies, posts".
		// So comment votes SHOULD be verified.
		
		// I will send contentType: "comment_vote" and update the backend to handle it.
		fetch("/api/blockchain/record-content", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contentId: commentId,
				contentType: "comment_vote",
			}),
		})
			.then(async (res) => {
				if (!res.ok) {
					let payload: any = null;
					try {
						payload = await res.json();
					} catch {
						payload = null;
					}
					console.error("Failed to record comment vote on chain:", {
						status: res.status,
						payload,
					});
				}
			})
			.catch((err) =>
				console.error("Failed to record comment vote on chain:", err),
			);

		// Optimistically update the local state
		const updateCommentVote = (comments: Comment[]): Comment[] => {
			return comments.map((comment) => {
				if (comment.id === commentId) {
					return {
						...comment,
						vote_count: (comment.vote_count || 0) + voteDelta,
						user_vote: newUserVote,
					};
				}
				if (comment.children) {
					return {
						...comment,
						children: updateCommentVote(comment.children),
					};
				}
				return comment;
			});
		};

		setComments(updateCommentVote(comments));
	};

	// Compute Tailwind classes for bias styling
	function getBiasClasses(bias?: string) {
		switch (bias) {
			case "for":
				return {
					card: "border-l-2 border-green-500",
					label: "",
				};
			case "against":
				return {
					card: "border-l-2 border-red-500",
					label: "",
				};
			default:
				return {
					card: "border-l-2 border-gray-300",
					label: "",
				};
		}
	}

	// Sort comments (recursively) by vote_count (upvotes)
	function sortCommentsRecursively(
		nodes: Comment[],
		order: "new" | "old"
	): Comment[] {
		const sorted = [...nodes].sort((a, b) => {
			// Sort by vote_count descending (highest upvotes first)
			return (b.vote_count || 0) - (a.vote_count || 0);
		});
		return sorted.map((n) => ({
			...n,
			children: n.children ? sortCommentsRecursively(n.children, order) : [],
		}));
	}

	// Filter comments to those that match term or contain matches in descendants
	function filterCommentsRecursively(
		nodes: Comment[],
		term: string
	): Comment[] {
		const q = term.trim().toLowerCase();
		if (!q) return nodes;
		const res: Comment[] = [];
		for (const n of nodes) {
			const childMatches = n.children
				? filterCommentsRecursively(n.children, term)
				: [];
			const selfMatches =
				(n.content || "").toLowerCase().includes(q) ||
				(n.profiles?.username || "").toLowerCase().includes(q);
			if (selfMatches || childMatches.length > 0) {
				res.push({ ...n, children: childMatches });
			}
		}
		return res;
	}

	// Convert Comment to CommentNode for compatibility
	const convertToCommentNode = (comment: Comment): CommentNode => ({
		...comment,
		profiles: comment.profiles || null,
		children: comment.children?.map(convertToCommentNode),
	});

	function renderComments(nodes: Comment[]) {
		return nodes.map((comment) => (
			<CommentItem
				key={comment.id}
				comment={convertToCommentNode(comment)}
				depth={0}
				isCollapsed={collapsedComments.has(comment.id)}
				onToggleCollapse={handleToggleCollapse}
				isCommentCollapsed={isCommentCollapsed}
				replyTo={replyTo}
				replyContent={replyContent}
				replyBias={replyBias}
				submitting={submitting}
				imagePreview={imagePreview}
				handleReply={handleReply}
				setReplyContent={setReplyContent}
				setReplyBias={setReplyBias}
				handleImageSelect={handleImageSelect}
				removeImage={removeImage}
				submitReply={submitReply}
				setReplyTo={setReplyTo}
				getBiasClasses={getBiasClasses}
				handleVote={handleVote}
				currentUserId={user_id}
				showSignupDialog={showSignupDialog}
				setShowSignupDialog={setShowSignupDialog}
			/>
		));
	}

	const processedComments = filterCommentsRecursively(
		sortCommentsRecursively(comments, sortBy),
		searchTerm
	);

	return (
		<div className="mt-8">
			<h2 className="text-xl font-semibold mb-4 ml-2">Comments</h2>
			{loading ? (
				<Skeleton className="h-12" />
			) : (
				<>
					{replyTo === null && (
						<div className="mb-6">
							{!showMainComposer ? (
								<div className="space-y-2">
									<Input
										placeholder={"Add your reply"}
										readOnly
										onClick={() => {
											if (!user_id) {
												setShowSignupDialog(true);
												return;
											}
											setShowMainComposer(true);
										}}
										className="h-12 rounded-full cursor-text bg-white"
									/>
								</div>
							) : (
								<div className="rounded-2xl border bg-white overflow-hidden">
									{/* Editor */}
									<div className="p-3">
										<Textarea
											ref={mainTextareaRef}
											value={replyContent}
											onChange={(e) => setReplyContent(e.target.value)}
											placeholder="Add a reply"
											rows={3}
											disabled={submitting}
											className="min-h-[96px] resize-y border-0 focus-visible:ring-0 focus-visible:outline-none"
										/>

										{/* Inline image preview */}
										{imagePreview && (
											<div className="relative inline-block mt-2">
												<Image
													src={imagePreview}
													alt="Preview"
													width={300}
													height={200}
													unoptimized
													className="max-w-xs rounded-lg border object-cover"
												/>
												<Button
													type="button"
													size="sm"
													variant="destructive"
													onClick={removeImage}
													className="absolute top-1 right-1 w-6 h-6 p-0"
												>
													<X className="w-3 h-3" />
												</Button>
											</div>
										)}
									</div>

									{/* Toolbar */}
									<div className="flex items-center justify-between px-3 py-2 ">
										<div className="flex items-center gap-1.5">
											<Input
												type="file"
												accept="image/*"
												onChange={handleImageSelect}
												disabled={submitting}
												className="hidden"
												id="image-upload-main"
											/>
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													document.getElementById("image-upload-main")?.click()
												}
												className="rounded-full"
												disabled={submitting}
											>
												<ImageIcon className="h-4 w-4" />
											</Button>
										</div>

										<div className="flex items-center gap-2">
											{/*
											<div className="hidden sm:flex items-center gap-1 mr-6">
												<Button
													variant={replyBias === "for" ? "default" : "ghost"}
													size="sm"
													onClick={() => setReplyBias("for")}
													className="rounded-full"
												>
													For
												</Button>
												<Button
													variant={
														replyBias === "neutral" ? "default" : "ghost"
													}
													size="sm"
													onClick={() => setReplyBias("neutral")}
													className="rounded-full"
												>
													Neutral
												</Button>
												<Button
													variant={
														replyBias === "against" ? "default" : "ghost"
													}
													size="sm"
													onClick={() => setReplyBias("against")}
													className="rounded-full"
												>
													Against
												</Button>
											</div>
											*/}

											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													setShowMainComposer(false);
													setReplyContent("");
													setSelectedImage(null);
													setImagePreview(null);
													setReplyBias("neutral");
												}}
												disabled={submitting}
											>
												Cancel
											</Button>
											<Button
												size="sm"
												onClick={() => submitReply(null)}
												disabled={submitting}
												className="bg-primary hover:bg-primary/80 text-white"
											>
												{submitting ? "Posting..." : "Comment"}
											</Button>
										</div>
									</div>
								</div>
							)}
						</div>
					)}
					{renderComments(processedComments)}
				</>
			)}

			<Dialog open={showSignupDialog} onOpenChange={setShowSignupDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Join Vox.Vote</DialogTitle>
						<DialogDescription>
							To vote or reply to comments, please create a verified account.
							All accounts require identity verification.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowSignupDialog(false)}
						>
							Not now
						</Button>
						<Button onClick={() => router.push("/signup")}>Sign Up</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Member Restriction Dialog */}
			<Dialog
				open={showMemberLimitDialog}
				onOpenChange={setShowMemberLimitDialog}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertCircle className="w-5 h-5 text-amber-500" />
							Verification Required
						</DialogTitle>
						<DialogDescription className="space-y-2">
							<p>
								To participate in discussions, you need a verified account.
							</p>
							<p className="pt-2">
								Please sign up for identity verification to unlock all features!
							</p>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowMemberLimitDialog(false)}
						>
							Maybe later
						</Button>
						<Button onClick={() => router.push("/signup/verified")}>
							Get Verified
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
