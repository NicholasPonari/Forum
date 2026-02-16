"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, ImageIcon, ArrowBigUp, ArrowBigDown, Minus } from "lucide-react";
import { SlBubble } from "react-icons/sl";
import { formatRelativeTime } from "@/lib/time-utils";
import { User } from "lucide-react";
import Link from "next/link";
import { BlockchainVerificationBadge } from "@/components/BlockchainVerificationBadge";

// Keep a local type matching the shape used in CommentThread
export interface CommentNode {
	id: string;
	user_id: string | null;
	issue_id: string;
	parent_id: string | null;
	content: string;
	image_url?: string | null;
	bias?: string;
	created_at: string;
	profiles?: {
		id: string;
		username: string;
		avatar_url: string;
		first_name: string;
		last_name: string;
	} | null;
	children?: CommentNode[];
	// Voting data
	vote_count?: number;
	user_vote?: number | null; // 1 for upvote, -1 for downvote, null for no vote
}

export type Bias = "for" | "neutral" | "against";

export interface CommentItemProps {
	comment: CommentNode;
	depth?: number;
	isCollapsed?: boolean;
	onToggleCollapse?: (commentId: string) => void;
	isCommentCollapsed?: (commentId: string) => boolean;

	// State from parent
	replyTo: string | null;
	replyContent: string;
	replyBias: Bias;
	submitting: boolean;
	imagePreview: string | null;

	// Handlers from parent
	handleReply: (parentId: string | null) => void;
	setReplyContent: (value: string) => void;
	setReplyBias: (value: Bias) => void;
	handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
	removeImage: () => void;
	submitReply: (parentId: string | null) => Promise<void> | void;
	setReplyTo: (value: string | null) => void;

	// Styling helper from parent (so single source of truth)
	getBiasClasses: (bias?: string) => { card: string; label: string };

	// Voting handlers
	handleVote: (commentId: string, value: number) => Promise<void>;
	currentUserId?: string;

	// Signup dialog
	showSignupDialog: boolean;
	setShowSignupDialog: (value: boolean) => void;
}

const MAX_DEPTH = 3;

export function CommentItem({
	comment,
	depth = 0,
	isCollapsed = false,
	onToggleCollapse,
	isCommentCollapsed,
	replyTo,
	replyContent,
	replyBias,
	submitting,
	imagePreview,
	handleReply,
	setReplyContent,
	setReplyBias,
	handleImageSelect,
	removeImage,
	submitReply,
	setReplyTo,
	getBiasClasses,
	handleVote,
	currentUserId,
	showSignupDialog,
	setShowSignupDialog,
}: CommentItemProps) {
	const imageInputId = `image-upload-reply-${comment.id}`;
	const hasChildren = comment.children && comment.children.length > 0;
	const isAtMaxDepth = depth >= MAX_DEPTH;

	return (
		<div className="relative">
			{/* L-shaped elbow connector for nested comments */}
			{depth > 0 && (
				<div
					className="absolute top-0 left-0 w-4 h-4 border-l-2 border-b-2 border-gray-300 rounded-bl-lg"
					style={{ marginLeft: "-15px" }}
				/>
			)}

			<div className="flex gap-1 mb-3">
				{/* Left column: Avatar + vertical line + collapse button */}
				<div className="flex flex-col items-center flex-shrink-0 relative">
					{comment.user_id ? (
						<Link
							href={`/profile/${comment.user_id}`}
							onClick={(e) => e.stopPropagation()}
						>
							<Avatar className="h-8 w-8 bg-gray-200 z-10 cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all">
								{comment.profiles?.avatar_url ? (
									<AvatarImage src={comment.profiles.avatar_url} />
								) : (
									<AvatarFallback className="text-xs bg-gray-200">
										<User className="w-4 h-4 text-gray-500" />
									</AvatarFallback>
								)}
							</Avatar>
						</Link>
					) : (
						<Avatar className="h-8 w-8 bg-gray-200 z-10">
							{comment.profiles?.avatar_url ? (
								<AvatarImage src={comment.profiles.avatar_url} />
							) : (
								<AvatarFallback className="text-xs bg-gray-200">
									<User className="w-4 h-4 text-gray-500" />
								</AvatarFallback>
							)}
						</Avatar>
					)}

					{/* Collapse button on the vertical line */}
					{hasChildren && !isCollapsed && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onToggleCollapse?.(comment.id)}
							className="h-5 w-5 p-0 hover:bg-gray-100 rounded-full bg-white border border-gray-300 mt-1 z-10"
							aria-label="Collapse thread"
						>
							<Minus className="h-3 w-3" />
						</Button>
					)}
				</div>

				{/* Right column: Content */}
				<div className="flex-1 min-w-0">
					{/* Username and timestamp */}
					<div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
						{comment.user_id ? (
							<Link
								href={`/profile/${comment.user_id}`}
								onClick={(e) => e.stopPropagation()}
								className="font-semibold text-gray-900 hover:text-orange-500 hover:underline transition-all"
							>
								{comment.profiles?.username ?? "Unknown"}
							</Link>
						) : (
							<span className="font-semibold text-gray-900">
								{comment.profiles?.username ?? "Unknown"}
							</span>
						)}
						<span>•</span>
						<span>•</span>
						<BlockchainVerificationBadge
							contentId={comment.id}
							contentType="comment"
							className="h-4 w-4"
						/>
						<span>{formatRelativeTime(comment.created_at)}</span>
					</div>

					{/* Collapsed state */}
					{isCollapsed ? (
						<button
							onClick={() => onToggleCollapse?.(comment.id)}
							className="text-xs text-gray-500 hover:text-gray-700"
						>
							[+] {comment.children?.length}{" "}
							{comment.children?.length === 1 ? "reply" : "replies"}
						</button>
					) : (
						<>
							{/* Comment content */}
							<div className="text-sm text-gray-900 mb-2 whitespace-pre-wrap">
								{comment.content}
							</div>

							{comment.image_url && (
								<div className="mb-2">
									<Image
										src={comment.image_url}
										alt="Comment attachment"
										width={300}
										height={200}
										className="max-w-xs rounded-lg border object-cover"
									/>
								</div>
							)}

							{/* Action buttons - collapse, upvote, vote count, downvote, reply, share */}
							<div className="flex items-center gap-0 ml-[-8px] text-gray-500">
								{/* Upvote */}
								<Button
									variant="ghost"
									size="icon"
									className={`h-6 w-6 p-0 gap-0 rounded ${
										comment.user_vote === 1
											? "text-orange-600 bg-orange-50"
											: ""
									} ${
										!currentUserId
											? "opacity-50 cursor-not-allowed"
											: "hover:bg-orange-100 hover:text-orange-600"
									}`}
									onClick={() => {
										if (!currentUserId) {
											setShowSignupDialog(true);
											return;
										}
										handleVote(comment.id, 1);
									}}
									disabled={!currentUserId}
									aria-label="Upvote"
								>
									<ArrowBigUp className="h-4 w-4" />
								</Button>

								{/* Vote count */}
								<span className="text-xs font-semibold text-gray-700 min-w-[28px] text-center">
									{comment.vote_count === 0 ? "Vote" : comment.vote_count || 0}
								</span>

								{/* Downvote */}
								<Button
									variant="ghost"
									size="icon"
									className={`h-6 w-6 p-0 rounded ${
										comment.user_vote === -1 ? "text-blue-600 bg-blue-50" : ""
									} ${
										!currentUserId
											? "opacity-50 cursor-not-allowed"
											: "hover:bg-blue-100 hover:text-blue-600"
									}`}
									onClick={() => {
										if (!currentUserId) {
											setShowSignupDialog(true);
											return;
										}
										handleVote(comment.id, -1);
									}}
									disabled={!currentUserId}
									aria-label="Downvote"
								>
									<ArrowBigDown className="h-4 w-4" />
								</Button>

								{/* Reply button */}
								{!isAtMaxDepth && (
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											if (!currentUserId) {
												setShowSignupDialog(true);
												return;
											}
											handleReply(comment.id);
										}}
										className={`h-6 px-2 text-xs rounded ${
											!currentUserId
												? "opacity-50 cursor-not-allowed"
												: "hover:bg-gray-100"
										}`}
										disabled={!currentUserId}
									>
										<SlBubble className="h-3 w-3 mr-1" /> Reply
									</Button>
								)}
							</div>

							{/* Reply form */}
							{replyTo === comment.id && (
								<div className="mt-3 rounded-2xl border bg-white overflow-hidden">
									{/* Editor */}
									<div className="p-3">
										<Textarea
											value={replyContent}
											onChange={(e) => setReplyContent(e.target.value)}
											placeholder="Add a reply"
											rows={1}
											autoFocus
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
									<div className="flex items-center justify-between px-3 py-2">
										<div className="flex items-center gap-1.5">
											<Input
												type="file"
												accept="image/*"
												onChange={handleImageSelect}
												disabled={submitting}
												className="hidden"
												id={imageInputId}
											/>
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													document.getElementById(imageInputId)?.click()
												}
												className="rounded-full"
												disabled={submitting}
											>
												<ImageIcon className="h-4 w-4" />
											</Button>
										</div>

										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setReplyTo(null)}
												disabled={submitting}
											>
												Cancel
											</Button>
											<Button
												size="sm"
												onClick={() => submitReply(comment.id)}
												disabled={submitting}
												className="bg-primary hover:bg-primary/80 text-white"
											>
												{submitting ? "Replying..." : "Reply"}
											</Button>
										</div>
									</div>
								</div>
							)}

							{/* Render children recursively with proper indentation */}
							{!isCollapsed &&
								comment.children &&
								comment.children.length > 0 && (
									<div className="mt-3 ml-[-6px] space-y-0 relative">
										{/* Vertical line that extends only through children */}
										<div
											className="absolute w-0.5 bg-gray-300"
											style={{
												left: "-15px",
												top: "-52px",
												height: "calc(100% - 16px)",
											}}
										/>
										{comment.children.map((child) => (
											<CommentItem
												key={child.id}
												comment={child}
												depth={depth + 1}
												isCollapsed={
													isCommentCollapsed
														? isCommentCollapsed(child.id)
														: false
												}
												onToggleCollapse={onToggleCollapse}
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
												handleVote={handleVote}
												setReplyTo={setReplyTo}
												getBiasClasses={getBiasClasses}
												currentUserId={currentUserId}
												showSignupDialog={showSignupDialog}
												setShowSignupDialog={setShowSignupDialog}
											/>
										))}
									</div>
								)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
