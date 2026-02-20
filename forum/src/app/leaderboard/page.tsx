"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { createClient } from "@/lib/supabaseClient";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Trophy, MessageSquare, FileText, ThumbsUp, User } from "lucide-react";

interface LeaderboardEntry {
	id: string;
	username: string | null;
	avatar_url: string | null;
	issues_count: number;
	comments_count: number;
	votes_count: number;
	score: number;
}

export default function LeaderboardPage() {
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchLeaderboard();
	}, []);

	const fetchLeaderboard = async () => {
		setLoading(true);
		const supabase = createClient();

		// Fetch profiles with their score and activity counts
		const { data: profiles } = await supabase
			.from("profiles")
			.select("id, username, avatar_url, score")
			.order("score", { ascending: false })
			.limit(20);

		if (!profiles) {
			setLoading(false);
			return;
		}

		// For each profile, count their issues, comments, and votes
		const leaderboardData: LeaderboardEntry[] = await Promise.all(
			profiles.map(async (profile) => {
				// Count issues posted by this user
				const { count: issuesCount } = await supabase
					.from("issues")
					.select("*", { count: "exact", head: true })
					.eq("user_id", profile.id);

				// Count comments posted by this user
				const { count: commentsCount } = await supabase
					.from("comments")
					.select("*", { count: "exact", head: true })
					.eq("user_id", profile.id);

				// Count votes (issue votes) by this user
				const { count: issueVotesCount } = await supabase
					.from("votes")
					.select("*", { count: "exact", head: true })
					.eq("user_id", profile.id);

				// Count comment votes by this user
				const { count: commentVotesCount } = await supabase
					.from("comment_votes")
					.select("*", { count: "exact", head: true })
					.eq("user_id", profile.id);

				const totalVotes = (issueVotesCount || 0) + (commentVotesCount || 0);

				return {
					id: profile.id,
					username: profile.username,
					avatar_url: profile.avatar_url,
					issues_count: issuesCount || 0,
					comments_count: commentsCount || 0,
					votes_count: totalVotes,
					score: profile.score || 0,
				};
			})
		);

		// Filter out the bot user and already sorted by score from the query
		const filteredLeaderboard = leaderboardData.filter(entry => entry.username !== "Vox.Vote");
		setLeaderboard(filteredLeaderboard);
		setLoading(false);
	};

	const getRankBadgeColor = (rank: number) => {
		if (rank === 1) return "bg-yellow-500 text-white hover:bg-yellow-600";
		if (rank === 2) return "bg-gray-400 text-white hover:bg-gray-500";
		if (rank === 3) return "bg-amber-700 text-white hover:bg-amber-800";
		return "bg-gray-200 text-gray-800 hover:bg-gray-300";
	};

	const getRankIcon = (rank: number) => {
		if (rank <= 3) {
			return <Trophy className="w-4 h-4 mr-1" />;
		}
		return null;
	};

	return (
		<>
			<Header />
			<div className="min-h-screen bg-gradient-to-b from-white to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-7xl mx-auto">
					<div className="text-center mb-12">
						<h1 className="text-4xl font-bold text-gray-900 mb-4">
							Community Leaderboard
						</h1>
						<p className="text-lg text-gray-600">
							Top 20 most active verified residents
						</p>
					</div>

					{loading ? (
						<div className="flex justify-center items-center py-20">
							<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
						</div>
					) : (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Trophy className="w-6 h-6 text-yellow-500" />
									Top Contributors
								</CardTitle>
								<CardDescription>
									Ranked by cumulative score from community contributions
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-20">Rank</TableHead>
												<TableHead>User</TableHead>
												<TableHead className="text-center">Score</TableHead>
												<TableHead className="text-center">
													<div className="flex items-center justify-center gap-1">
														<FileText className="w-4 h-4" />
														<span>Issues</span>
													</div>
												</TableHead>
												<TableHead className="text-center">
													<div className="flex items-center justify-center gap-1">
														<MessageSquare className="w-4 h-4" />
														<span>Comments</span>
													</div>
												</TableHead>
												<TableHead className="text-center">
													<div className="flex items-center justify-center gap-1">
														<ThumbsUp className="w-4 h-4" />
														<span>Votes</span>
													</div>
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{leaderboard.map((entry, index) => {
												const rank = index + 1;
												return (
													<TableRow key={entry.id} className="hover:bg-gray-50">
														<TableCell>
															<Badge className={getRankBadgeColor(rank)}>
																<div className="flex items-center">
																	{getRankIcon(rank)}
																	<span>#{rank}</span>
																</div>
															</Badge>
														</TableCell>
														<TableCell>
															<div className="flex items-center gap-3">
																<Avatar>
																	<AvatarImage
																		src={entry.avatar_url || undefined}
																	/>
																	<AvatarFallback className="bg-gray-200">
																		<User className="w-5 h-5 text-gray-500" />
																	</AvatarFallback>
																</Avatar>
																<span className="font-medium">
																	{entry.username || "Anonymous"}
																</span>
															</div>
														</TableCell>
														<TableCell className="text-center font-bold">
															{entry.score}
														</TableCell>
														<TableCell className="text-center">
															{entry.issues_count}
														</TableCell>
														<TableCell className="text-center">
															{entry.comments_count}
														</TableCell>
														<TableCell className="text-center">
															{entry.votes_count}
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</div>
								{leaderboard.length === 0 && (
									<div className="text-center py-10 text-gray-500">
										No activity data available yet.
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>
			</div>
			<Footer />
		</>
	);
}
