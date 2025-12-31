import Image from "next/image";
import { Card, CardContent } from "./ui/card";
import { useRouter } from "next/navigation";
import { Issue, VoteMap, VoteBreakdown } from "@/lib/types/db";
import { VoteButtons } from "./VoteButtons";
import { formatTimeAgo } from "@/lib/timeUtils";
import { getDistrictUrl, getLevelLabel } from "@/lib/districts";
import { getTopicLabel } from "@/lib/topics";
import Link from "next/link";
import { Bookmark, User, Home, MapPin, Globe } from "lucide-react";
import { SlBubble } from "react-icons/sl";
import { Button } from "./ui/button";
import { ShareDialog } from "./ShareDialog";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "./ui/dialog";
import { useTranslation } from "@/hooks/use-translation";

export function IssueCard({
	issue,
	votes,
	voteBreakdown,
	commentsCount,
}: {
	issue: Issue;
	votes: VoteMap;
	voteBreakdown: VoteBreakdown;
	commentsCount: number;
}) {
	const router = useRouter();
	const { user, profile, refreshProfile } = useAuth();
	const { t } = useTranslation();
	const [isBookmarked, setIsBookmarked] = useState(false);
	const [isBookmarking, setIsBookmarking] = useState(false);
	const [showVerifyDialog, setShowVerifyDialog] = useState(false);

	useEffect(() => {
		if (!user) {
			setIsBookmarked(false);
			return;
		}

		const bookmarks = profile?.bookmarks ?? [];
		setIsBookmarked(bookmarks.includes(issue.id.toString()));
	}, [issue.id, profile?.bookmarks, user]);

	const handleBookmark = async () => {
		if (!user) {
			setShowVerifyDialog(true);
			return;
		}

		setIsBookmarking(true);
		try {
			const response = await fetch("/api/bookmarks", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					issueId: issue.id,
					action: isBookmarked ? "remove" : "add",
				}),
			});

			if (response.ok) {
				setIsBookmarked(!isBookmarked);
				await refreshProfile();
			}
		} catch (error) {
			console.error("Error bookmarking:", error);
		} finally {
			setIsBookmarking(false);
		}
	};

	return (
		<Card className="bg-white border border-gray-200 hover:border-gray-300 transition-colors duration-200 mb-2">
			<CardContent className="p-4">
				{/* Header with User Info & Context */}
				<div className="flex flex-col gap-3 mb-3">
					{/* Top Row: User Info */}
					<div className="flex items-center gap-3">
						{issue.user_id ? (
							<Link
								href={`/profile/${issue.user_id}`}
								onClick={(e) => e.stopPropagation()}
							>
								<Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
									<AvatarImage src={issue.avatar_url || ""} />
									<AvatarFallback className="bg-gray-100">
										<User className="w-5 h-5 text-gray-400" />
									</AvatarFallback>
								</Avatar>
							</Link>
						) : (
							<Avatar className="h-10 w-10">
								<AvatarImage src={issue.avatar_url || ""} />
								<AvatarFallback className="bg-gray-100">
									<User className="w-5 h-5 text-gray-400" />
								</AvatarFallback>
							</Avatar>
						)}

						<div className="flex flex-col min-w-0">
							<div className="flex items-center gap-2">
								{issue.username ? (
									<Link
										href={`/profile/${issue.user_id}`}
										onClick={(e) => e.stopPropagation()}
										className="font-semibold text-sm text-gray-900 hover:text-primary hover:underline truncate"
									>
										{issue.username}
									</Link>
								) : (
									<span className="font-semibold text-sm text-gray-900">
										{t.issueCard.anonymous}
									</span>
								)}
								<span className="text-xs text-gray-400">•</span>
								<span className="text-xs text-gray-500 whitespace-nowrap">
									{formatTimeAgo(issue.created_at, t.time)}
								</span>
							</div>

							{/* User Location */}
							{(issue.author_city || issue.author_province) && (
								<div className="text-xs text-gray-500 truncate">
									{t.issueCard.residentOf} {issue.author_city}
									{issue.author_city && issue.author_province ? ", " : ""}
									{issue.author_province}
								</div>
							)}
						</div>
					</div>

					{/* Middle Row: Issue Context (Tags & Location) */}
					<div className="flex flex-wrap items-center gap-2">
						{issue.government_level && (
							<Badge
								variant="secondary"
								className={cn(
									"font-medium px-2 py-0.5 h-6 text-xs",
									issue.government_level === "municipal" &&
										"bg-orange-100 text-orange-700 hover:bg-orange-200",
									issue.government_level === "provincial" &&
										"bg-purple-100 text-purple-700 hover:bg-purple-200",
									issue.government_level === "federal" &&
										"bg-blue-100 text-blue-700 hover:bg-blue-200"
								)}
							>
								<Globe className="w-3 h-3 mr-1" />
								{t.nav[issue.government_level] || getLevelLabel(issue.government_level)}
							</Badge>
						)}

						{issue.topic && (
							<Badge
								variant="outline"
								className="text-xs px-2 py-0.5 h-6 text-gray-600 bg-gray-50/50"
							>
								{t.topics[issue.topic as keyof typeof t.topics] || getTopicLabel(issue.topic)}
							</Badge>
						)}

						{/* Divider if we have locations */}
						{(issue.municipal_district ||
							issue.provincial_district ||
							issue.federal_district) && (
							<div className="w-px h-4 bg-gray-200 mx-1 hidden sm:block" />
						)}

						{/* Issue Location Districts */}
						{(issue.municipal_district ||
							issue.provincial_district ||
							issue.federal_district) && (
							<div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
								{issue.municipal_district && (
									<Link
										href={getDistrictUrl("municipal", issue.municipal_district)}
										className="inline-flex items-center hover:text-primary hover:underline bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100"
										onClick={(e) => e.stopPropagation()}
									>
										<MapPin className="w-3 h-3 mr-1 text-gray-400" />
										{issue.municipal_district}
									</Link>
								)}
								{issue.provincial_district && (
									<Link
										href={getDistrictUrl(
											"provincial",
											issue.provincial_district
										)}
										className="inline-flex items-center hover:text-primary hover:underline bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100"
										onClick={(e) => e.stopPropagation()}
									>
										<Home className="w-3 h-3 mr-1 text-gray-400" />
										{issue.provincial_district}
									</Link>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Title */}
				<Link href={`/${issue.id}`}>
					<h2 className="font-semibold text-lg text-gray-900 hover:text-blue-600 cursor-pointer mb-2 line-clamp-2">
						{issue.title}
					</h2>
				</Link>

				{/* Description preview */}
				{issue.narrative && (
					<p className="text-gray-600 text-sm mb-3 line-clamp-3">
						{issue.narrative}
					</p>
				)}

				{/* Image/Video thumbnail - Full width below content */}
				{(issue.image_url || issue.video_url) && (
					<div className="mb-3">
						<div
							className="w-full relative rounded-lg overflow-hidden cursor-pointer group"
							style={{ maxHeight: "512px" }}
							onClick={() => router.push(`/${issue.id}`)}
						>
							{issue.media_type === "video" && issue.video_url ? (
								<div
									className="relative w-full"
									style={{ aspectRatio: "16/9" }}
								>
									<Image
										src={`https://image.mux.com/${
											issue.video_url.split("/")[3].split(".")[0]
										}/thumbnail.jpg?width=1200&height=675&fit_mode=crop`}
										alt={issue.title}
										fill
										className="object-cover"
										sizes="(max-width: 768px) 100vw, 800px"
										priority={false}
									/>
									{/* Video play icon overlay */}
									<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
										<div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center">
											<svg
												className="w-8 h-8 text-gray-800 ml-1"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path d="M8 5v14l11-7z" />
											</svg>
										</div>
									</div>
								</div>
							) : issue.image_url ? (
								<div
									className="relative w-full"
									style={{ aspectRatio: "16/9" }}
								>
									<Image
										src={issue.image_url}
										alt={issue.title}
										fill
										className="object-cover"
										sizes="(max-width: 768px) 100vw, 800px"
										priority={false}
									/>
								</div>
							) : null}
						</div>
					</div>
				)}

				{/* Action buttons */}
				<div className="flex items-center gap-4 text-xs text-gray-500">
					<div className="flex items-center gap-2 px-2 py-1 rounded-3xl text-black bg-gray-100">
						<VoteButtons
							issueId={issue.id}
							initialVotes={votes[issue.id] ?? 0}
							upvotes={voteBreakdown[issue.id]?.upvotes ?? 0}
							downvotes={voteBreakdown[issue.id]?.downvotes ?? 0}
							onRequireVerification={() => setShowVerifyDialog(true)}
						/>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-auto px-3 py-2 rounded-3xl text-black bg-gray-100 hover:bg-gray-200"
						onClick={() => router.push(`/${issue.id}`)}
					>
						<SlBubble className="w-4 h-4 mr-1" />
						{commentsCount}
					</Button>
					<ShareDialog issue={issue} />
					<Button
						variant="ghost"
						size="sm"
						className="h-auto px-3 py-2 rounded-3xl text-black bg-gray-100 hover:bg-gray-200"
						onClick={handleBookmark}
						disabled={isBookmarking}
					>
						<Bookmark
							className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`}
						/>
					</Button>
				</div>

				<Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t.issueCard.joinTitle}</DialogTitle>
							<DialogDescription>
								{t.issueCard.joinDesc}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setShowVerifyDialog(false)}
							>
								{t.issueCard.notNow}
							</Button>
							<Button onClick={() => router.push("/signup")}>{t.issueCard.signUp}</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}
