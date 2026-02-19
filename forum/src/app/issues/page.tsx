"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { createClient } from "@/lib/supabaseClient";
import {
	Issue,
	VoteMap,
	VoteBreakdown,
	CommentsCountMap,
} from "@/lib/types/db";
import { Skeleton } from "@/components/ui/skeleton";
import { DistrictNav } from "@/components/DistrictNav";
import { DistrictFeed } from "@/components/DistrictFeed";
import { ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TOPICS_LIST } from "@/lib/topics";

interface TopicCount {
	topic: string;
	count: number;
}

export default function IssuesPage() {
	const [topicCounts, setTopicCounts] = useState<TopicCount[]>([]);
	const [recentIssues, setRecentIssues] = useState<Issue[]>([]);
	const [votes, setVotes] = useState<VoteMap>({});
	const [voteBreakdown, setVoteBreakdown] = useState<VoteBreakdown>({});
	const [commentsCount, setCommentsCount] = useState<CommentsCountMap>({});
	const [loading, setLoading] = useState(true);
	const [scrollProgress, setScrollProgress] = useState(0);
	const headerLogoRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleScroll = () => {
			const scrollY = window.scrollY;
			const fadeStart = 0;
			const fadeEnd = 100;
			const progress = Math.min(
				Math.max((scrollY - fadeStart) / (fadeEnd - fadeStart), 0),
				1,
			);
			setScrollProgress(progress);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const fetchData = useCallback(async () => {
		setLoading(true);
		const supabase = createClient();

		// Fetch recent issues with topics
		const { data: issuesData } = await supabase
			.from("issues")
			.select(
				`id, title, type, narrative, image_url, created_at, user_id, profiles (username, type, avatar_url, municipal_districts!profiles_municipal_district_id_fkey (city), provincial_districts!profiles_provincial_district_id_fkey (province)), votes (issue_id, value), location_lat, location_lng, address, video_url, external_video_url, media_type, federal_district, municipal_district, provincial_district, topic, government_level`,
			)
			.not("topic", "is", null)
			.order("created_at", { ascending: false })
			.limit(20);

		const issuesWithUsernames = (issuesData || []).map((issue) => {
			const profile =
				Array.isArray(issue.profiles) ? issue.profiles[0] : issue.profiles;
			const municipalDistrict =
				Array.isArray(profile?.municipal_districts) ?
					profile.municipal_districts[0]
				:	profile?.municipal_districts;
			const provincialDistrict =
				Array.isArray(profile?.provincial_districts) ?
					profile.provincial_districts[0]
				:	profile?.provincial_districts;
			return {
				...issue,
				username: profile?.username || null,
				user_role: profile?.type || null,
				avatar_url: profile?.avatar_url || null,
				author_city: municipalDistrict?.city ?? null,
				author_province: provincialDistrict?.province ?? null,
			};
		});
		setRecentIssues(issuesWithUsernames);

		// Calculate topic counts
		const counts: Record<string, number> = {};
		for (const topic of TOPICS_LIST) {
			counts[topic.id] = 0;
		}

		// Fetch all issues to count topics
		const { data: allIssues } = await supabase
			.from("issues")
			.select("topic")
			.not("topic", "is", null);

		if (allIssues) {
			for (const issue of allIssues) {
				if (issue.topic && counts[issue.topic] !== undefined) {
					counts[issue.topic]++;
				}
			}
		}

		setTopicCounts(
			TOPICS_LIST.map((t) => ({ topic: t.id, count: counts[t.id] || 0 })),
		);

		// Calculate votes
		const voteMap: VoteMap = {};
		const breakdown: VoteBreakdown = {};
		for (const issue of issuesWithUsernames) {
			const issueId = issue.id;
			const votesArr = Array.isArray(issue.votes) ? issue.votes : [];
			voteMap[issueId] = 0;
			breakdown[issueId] = { upvotes: 0, downvotes: 0 };
			for (const v of votesArr) {
				voteMap[issueId] += v.value;
				if (v.value === 1) breakdown[issueId].upvotes += 1;
				if (v.value === -1) breakdown[issueId].downvotes += 1;
			}
		}
		setVotes(voteMap);
		setVoteBreakdown(breakdown);

		// Fetch comments count
		const issueIds = issuesWithUsernames.map((i) => i.id);
		const { data: commentsData } = await supabase
			.from("comments")
			.select("issue_id")
			.in("issue_id", issueIds);

		const commentsCountMap: CommentsCountMap = {};
		for (const issue of issuesWithUsernames) {
			commentsCountMap[issue.id] = 0;
		}

		if (commentsData) {
			for (const comment of commentsData) {
				const issueId = parseInt(comment.issue_id);
				if (commentsCountMap[issueId] !== undefined) {
					commentsCountMap[issueId]++;
				}
			}
		}

		setCommentsCount(commentsCountMap);
		setLoading(false);
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	if (loading) {
		return (
			<>
				<Header logoRef={headerLogoRef} logoOpacity={scrollProgress} />
				<div className="flex min-h-screen">
					<aside className="hidden lg:block w-64 border-r bg-white shrink-0">
						<Skeleton className="h-full" />
					</aside>
					<main className="flex-1 p-6">
						<Skeleton className="h-12 w-64 mb-6" />
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
							{[1, 2, 3, 4, 5, 6].map((i) => (
								<Skeleton key={i} className="h-24" />
							))}
						</div>
					</main>
				</div>
			</>
		);
	}

	return (
		<>
			<Header logoRef={headerLogoRef} logoOpacity={scrollProgress} />
			<div className="flex min-h-screen bg-gray-50">
				{/* Desktop Sidebar */}
				<aside className="hidden lg:block w-64 border-r bg-white shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
					<DistrictNav />
				</aside>

				{/* Main Content */}
				<main className="flex-1 max-w-4xl mx-auto py-6 px-4">
					{/* Breadcrumb / Header */}
					<div className="mb-6">
						<Link
							href="/"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
						>
							<ArrowLeft className="w-4 h-4" />
							Back to all posts
						</Link>
						<div className="flex items-center gap-3">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
								<Layers className="w-5 h-5" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Browse by Topic</h1>
								<p className="text-sm text-gray-500">
									Explore issues organized by topic across all government levels
								</p>
							</div>
						</div>
					</div>

					{/* Topics Grid */}
					<div className="bg-white rounded-xl border p-4 mb-6">
						<h2 className="text-sm font-semibold text-gray-700 mb-3">
							All Topics
						</h2>
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
							{TOPICS_LIST.map((topic) => {
								const Icon = topic.icon;
								const count =
									topicCounts.find((t) => t.topic === topic.id)?.count || 0;
								return (
									<Link
										key={topic.id}
										href={`/issues/${topic.id}`}
										className={cn(
											"flex flex-col items-center p-4 rounded-lg border hover:shadow-md transition-all",
											"hover:border-primary/30",
										)}
									>
										<div
											className={cn(
												"w-10 h-10 rounded-full flex items-center justify-center mb-2",
												topic.color,
											)}
										>
											<Icon className="w-5 h-5" />
										</div>
										<span className="text-sm font-medium text-center">
											{topic.label}
										</span>
										<span className="text-xs text-gray-400 mt-1">
											{count} post{count !== 1 ? "s" : ""}
										</span>
									</Link>
								);
							})}
						</div>
					</div>

					{/* Recent Issues with Topics */}
					<div className="mb-4">
						<h2 className="text-lg font-semibold text-gray-800">
							Recent Topical Posts
						</h2>
						<p className="text-sm text-gray-500">
							Latest posts categorized by topic
						</p>
					</div>

					{recentIssues.length === 0 ?
						<div className="text-center py-12 bg-white rounded-xl border">
							<Layers className="w-12 h-12 mx-auto text-gray-300 mb-3" />
							<p className="text-gray-500 mb-2">No topical posts yet.</p>
							<p className="text-sm text-gray-400 mb-4">
								Be the first to post about a specific topic!
							</p>
							<Link href="/" className="text-primary hover:underline text-sm">
								Browse all posts
							</Link>
						</div>
					:	<DistrictFeed
							issues={recentIssues}
							votes={votes}
							voteBreakdown={voteBreakdown}
							commentsCount={commentsCount}
						/>
					}
				</main>
			</div>
			<Footer />
		</>
	);
}
