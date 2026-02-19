"use client";

import { useCallback, useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { createClient } from "@/lib/supabaseClient";
import { GovernmentLevel } from "@/lib/types/geo";
import {
	Issue,
	VoteMap,
	VoteBreakdown,
	CommentsCountMap,
} from "@/lib/types/db";
import { Skeleton } from "@/components/ui/skeleton";
import { DistrictNav } from "@/components/DistrictNav";
import { DistrictFeed } from "@/components/DistrictFeed";
import { toSlug, getLevelLabel, getDistrictFieldName } from "@/lib/districts";
import { ArrowLeft, Building2, Home, MapPin } from "lucide-react";
import Link from "next/link";

interface DistrictPageProps {
	params: Promise<{
		level: string;
		slug: string;
	}>;
}

const levelIcons: Record<GovernmentLevel, React.ReactNode> = {
	federal: <Building2 className="w-5 h-5" />,
	provincial: <Home className="w-5 h-5" />,
	municipal: <MapPin className="w-5 h-5" />,
};

export default function DistrictPage({ params }: DistrictPageProps) {
	const { level, slug } = use(params);
	const router = useRouter();
	const [issues, setIssues] = useState<Issue[]>([]);
	const [votes, setVotes] = useState<VoteMap>({});
	const [voteBreakdown, setVoteBreakdown] = useState<VoteBreakdown>({});
	const [commentsCount, setCommentsCount] = useState<CommentsCountMap>({});
	const [loading, setLoading] = useState(true);
	const [districtName, setDistrictName] = useState<string>("");
	const [scrollProgress, setScrollProgress] = useState(0);
	const headerLogoRef = useRef<HTMLDivElement>(null);

	// Validate level
	const validLevels: GovernmentLevel[] = ["federal", "provincial", "municipal"];
	const governmentLevel =
		validLevels.includes(level as GovernmentLevel) ?
			(level as GovernmentLevel)
		:	null;

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
		if (!governmentLevel) return;

		setLoading(true);
		const supabase = createClient();

		// First, find the district name from the slug
		let districtNameResult: string | null = null;

		if (governmentLevel === "federal") {
			const { data } = await supabase
				.from("federal_districts")
				.select("name_en")
				.limit(100);
			const match = data?.find((d) => toSlug(d.name_en || "") === slug);
			districtNameResult = match?.name_en || null;
		} else if (governmentLevel === "provincial") {
			const { data } = await supabase
				.from("provincial_districts")
				.select("name")
				.limit(200);
			const match = data?.find((d) => toSlug(d.name || "") === slug);
			districtNameResult = match?.name || null;
		} else if (governmentLevel === "municipal") {
			const { data } = await supabase
				.from("municipal_districts")
				.select("name, borough")
				.limit(200);
			const match = data?.find((d) => toSlug(d.name || "") === slug);
			districtNameResult = match?.name || null;
		}

		if (!districtNameResult) {
			setLoading(false);
			return;
		}

		setDistrictName(districtNameResult);

		// Fetch issues for this district - filter by both district name AND government_level
		const fieldName = getDistrictFieldName(governmentLevel);
		const { data: issuesData } = await supabase
			.from("issues")
			.select(
				`id, title, type, narrative, image_url, created_at, user_id, profiles (username, type, avatar_url, municipal_districts!profiles_municipal_district_id_fkey (city), provincial_districts!profiles_provincial_district_id_fkey (province)), votes (issue_id, value), location_lat, location_lng, address, video_url, external_video_url, media_type, federal_district, municipal_district, provincial_district, topic, government_level`,
			)
			.eq(fieldName, districtNameResult)
			.eq("government_level", governmentLevel);

		// Attach username and user role to each issue
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
		const { data: commentsData } = await supabase
			.from("comments")
			.select("issue_id");

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
	}, [governmentLevel, slug]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	if (!governmentLevel) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-2">Invalid District Level</h1>
					<p className="text-gray-600 mb-4">
						Please use federal, provincial, or municipal.
					</p>
					<Link href="/" className="text-primary hover:underline">
						← Back to Home
					</Link>
				</div>
			</div>
		);
	}

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
				<aside className="hidden lg:block w-64 border-r bg-white shrink-0 sticky top-16 h-[calc(100vh-4rem)] z-20">
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
								{levelIcons[governmentLevel]}
							</div>
							<div>
								<h1 className="text-2xl font-bold">{districtName}</h1>
								<p className="text-sm text-gray-500">
									{getLevelLabel(governmentLevel)} District • {issues.length}{" "}
									post
									{issues.length !== 1 ? "s" : ""}
								</p>
							</div>
						</div>
					</div>

					{/* Feed */}
					{issues.length === 0 ?
						<div className="text-center py-12 bg-white rounded-xl border">
							<p className="text-gray-500 mb-2">
								No posts in this district yet.
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
