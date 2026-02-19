"use client";

import { useCallback, useEffect, useState, useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { createClient } from "@/lib/supabaseClient";
import {
	Issue,
	VoteMap,
	VoteBreakdown,
	CommentsCountMap,
} from "@/lib/types/db";
import { GovernmentLevel } from "@/lib/types/geo";
import { Skeleton } from "@/components/ui/skeleton";
import { DistrictNav } from "@/components/DistrictNav";
import { DistrictFeed } from "@/components/DistrictFeed";
import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getTopicConfig } from "@/lib/topics";

const LEVEL_LABELS: Record<string, string> = {
	federal: "Federal",
	provincial: "Provincial",
	municipal: "Municipal",
};

interface TopicPageProps {
	params: Promise<{
		topic: string;
	}>;
}

export default function TopicPage({ params }: TopicPageProps) {
	const { topic } = use(params);
	const searchParams = useSearchParams();
	const initialLevel = searchParams.get("level") as
		| GovernmentLevel
		| "all"
		| null;
	const province = searchParams.get("province");
	const city = searchParams.get("city");

	const [issues, setIssues] = useState<Issue[]>([]);
	const [votes, setVotes] = useState<VoteMap>({});
	const [voteBreakdown, setVoteBreakdown] = useState<VoteBreakdown>({});
	const [commentsCount, setCommentsCount] = useState<CommentsCountMap>({});
	const [loading, setLoading] = useState(true);
	const selectedLevel = initialLevel || "all";
	const [scrollProgress, setScrollProgress] = useState(0);
	const headerLogoRef = useRef<HTMLDivElement>(null);

	const topicConfig = getTopicConfig(topic);

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
		if (!topicConfig) return;

		setLoading(true);
		const supabase = createClient();

		// Build query for issues with this topic
		let query = supabase
			.from("issues")
			.select(
				`id, title, type, narrative, image_url, created_at, user_id, profiles (username, type, avatar_url, municipal_districts!profiles_municipal_district_id_fkey (city), provincial_districts!profiles_provincial_district_id_fkey (province)), votes (issue_id, value), location_lat, location_lng, address, video_url, external_video_url, media_type, federal_district, municipal_district, provincial_district, topic, government_level, province, city`,
			)
			.eq("topic", topic)
			.order("created_at", { ascending: false });

		// Filter by government level if not "all"
		if (selectedLevel !== "all") {
			query = query.eq("government_level", selectedLevel);
		}

		if (selectedLevel === "provincial" && province) {
			const { data: provincialDistricts } = await supabase
				.from("provincial_districts")
				.select("name")
				.eq("province", province)
				.limit(1000);

			const districtNames = (provincialDistricts || [])
				.map((d) => d.name)
				.filter((name): name is string => Boolean(name));

			// Include both:
			// - district-scoped provincial posts inside this province
			// - broad province-scoped posts (province set, district null)
			if (districtNames.length > 0) {
				query = query.or(
					`provincial_district.in.(${districtNames
						.map((n) => `"${n.replaceAll('"', '\\"')}"`)
						.join(",")}),province.eq.${province}`,
				);
			} else {
				query = query.eq("province", province);
			}
		}

		if (selectedLevel === "municipal" && city) {
			const { data: municipalDistricts } = await supabase
				.from("municipal_districts")
				.select("name")
				.eq("city", city)
				.limit(2000);

			const districtNames = (municipalDistricts || [])
				.map((d) => d.name)
				.filter((name): name is string => Boolean(name));

			// Include both:
			// - district-scoped municipal posts inside this city
			// - broad city-scoped posts (city set, district null)
			if (districtNames.length > 0) {
				query = query.or(
					`municipal_district.in.(${districtNames
						.map((n) => `"${n.replaceAll('"', '\\"')}"`)
						.join(",")}),city.eq.${city}`,
				);
			} else {
				query = query.eq("city", city);
			}
		}

		const { data: issuesData } = await query;

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
		setIssues(issuesWithUsernames);

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
		if (issueIds.length > 0) {
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
		} else {
			setCommentsCount({});
		}

		setLoading(false);
	}, [city, province, topic, topicConfig, selectedLevel]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Invalid topic
	if (!topicConfig) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-2">Topic Not Found</h1>
					<p className="text-gray-600 mb-4">
						The topic &quot;{topic}&quot; doesn&apos;t exist.
					</p>
					<Link href="/issues" className="text-primary hover:underline">
						← Browse all topics
					</Link>
				</div>
			</div>
		);
	}

	const TopicIcon = topicConfig.icon;

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
						<div className="space-y-4">
							{[1, 2, 3].map((i) => (
								<Skeleton key={i} className="h-32" />
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
							href="/issues"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
						>
							<ArrowLeft className="w-4 h-4" />
							Back to all topics
						</Link>
						<div className="flex items-center gap-3">
							<div
								className={cn(
									"flex items-center justify-center w-10 h-10 rounded-lg",
									topicConfig.color,
								)}
							>
								<TopicIcon className="w-5 h-5" />
							</div>
							<div>
								<div className="flex items-center gap-2 flex-wrap">
									<h1 className="text-2xl font-bold">{topicConfig.label}</h1>
									{(city ||
										province ||
										(selectedLevel !== "all" && selectedLevel)) && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
											<MapPin className="w-3.5 h-3.5" />
											{city ||
												province ||
												(selectedLevel !== "all" ?
													LEVEL_LABELS[selectedLevel]
												:	"")}
										</span>
									)}
								</div>
								<p className="text-sm text-gray-500">
									{issues.length} post{issues.length !== 1 ? "s" : ""} about{" "}
									{topicConfig.label.toLowerCase()}
									{city && ` in ${city}`}
									{province && !city && ` in ${province}`}
									{selectedLevel !== "all" &&
										!city &&
										!province &&
										` at the ${LEVEL_LABELS[
											selectedLevel
										].toLowerCase()} level`}
								</p>
							</div>
						</div>
					</div>

					{/* Feed */}
					{issues.length === 0 ?
						<div className="text-center py-12 bg-white rounded-xl border">
							<TopicIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
							<p className="text-gray-500 mb-2">
								No {topicConfig.label.toLowerCase()} posts
								{selectedLevel !== "all" ?
									` at the ${selectedLevel} level`
								:	""}{" "}
								yet.
							</p>
							<p className="text-sm text-gray-400 mb-4">
								Be the first to start a discussion about{" "}
								{topicConfig.label.toLowerCase()}!
							</p>
							<Link href="/" className="text-primary hover:underline text-sm">
								Browse all posts
							</Link>
						</div>
					:	<DistrictFeed
							issues={issues}
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
