"use client";

import { useCallback, useEffect, useState, useRef, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { createClient } from "@/lib/supabaseClient";
import { District, GovernmentLevel } from "@/lib/types/geo";
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
import {
	ArrowLeft,
	Building2,
	Home,
	MapPin,
	Globe,
	Search,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PROVINCES = [
	{ code: "ON", name: "Ontario" },
	{ code: "QC", name: "Quebec" },
	{ code: "BC", name: "British Columbia" },
	{ code: "AB", name: "Alberta" },
	{ code: "MB", name: "Manitoba" },
	{ code: "SK", name: "Saskatchewan" },
	{ code: "NS", name: "Nova Scotia" },
	{ code: "NB", name: "New Brunswick" },
	{ code: "NL", name: "Newfoundland and Labrador" },
	{ code: "PE", name: "Prince Edward Island" },
	{ code: "NT", name: "Northwest Territories" },
	{ code: "YT", name: "Yukon" },
	{ code: "NU", name: "Nunavut" },
] as const;

interface LevelPageProps {
	params: Promise<{
		level: string;
	}>;
}

const levelIcons: Record<GovernmentLevel, React.ReactNode> = {
	federal: <Building2 className="w-5 h-5" />,
	provincial: <Home className="w-5 h-5" />,
	municipal: <MapPin className="w-5 h-5" />,
};

const levelDescriptions: Record<GovernmentLevel, string> = {
	federal:
		"Issues and discussions affecting all of Canada at the federal level",
	provincial: "Provincial and territorial matters across all regions",
	municipal: "Local issues from cities and municipalities",
};

export default function LevelPage({ params }: LevelPageProps) {
	const { level } = use(params);
	const [issues, setIssues] = useState<Issue[]>([]);
	const [districts, setDistricts] = useState<District[]>([]);
	const [votes, setVotes] = useState<VoteMap>({});
	const [voteBreakdown, setVoteBreakdown] = useState<VoteBreakdown>({});
	const [commentsCount, setCommentsCount] = useState<CommentsCountMap>({});
	const [loading, setLoading] = useState(true);
	const [scrollProgress, setScrollProgress] = useState(0);
	const [districtSearch, setDistrictSearch] = useState("");
	const [selectedProvince, setSelectedProvince] = useState<string>("all");
	const headerLogoRef = useRef<HTMLDivElement>(null);
	const router = useRouter();
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("search") || "";

	// Sync selectedProvince with searchQuery on mount
	useEffect(() => {
		if (searchQuery) {
			const match = PROVINCES.find(
				(p) => p.name.toLowerCase() === searchQuery.toLowerCase(),
			);
			if (match) {
				setSelectedProvince(match.code);
			}
		}
	}, [searchQuery]);

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

		// Fetch all districts for this level
		let districtData: District[] = [];
		if (governmentLevel === "federal") {
			const { data } = await supabase
				.from("federal_districts")
				.select("id, name_en");
			districtData = (data || []).map((d) => ({
				id: d.id,
				name: d.name_en || "",
				slug: toSlug(d.name_en || ""),
				level: "federal" as GovernmentLevel,
			}));
		} else if (governmentLevel === "provincial") {
			// If search param is a province name, filter by that province
			let query = supabase
				.from("provincial_districts")
				.select("id, name, province");

			if (searchQuery) {
				query = query.ilike("province", `%${searchQuery}%`);
			}

			const { data } = await query;
			districtData = (data || []).map((d) => ({
				id: d.id,
				name: d.name || "",
				slug: toSlug(d.name || ""),
				level: "provincial" as GovernmentLevel,
			}));
		} else if (governmentLevel === "municipal") {
			const { data } = await supabase
				.from("municipal_districts")
				.select("id, name, borough");
			districtData = (data || []).map((d) => ({
				id: d.id,
				name: d.name || "",
				slug: toSlug(d.name || ""),
				level: "municipal" as GovernmentLevel,
				borough: d.borough,
			}));
		}
		setDistricts(districtData);

		// Fetch all issues for this level - filter strictly by government_level
		let issuesQuery = supabase
			.from("issues")
			.select(
				`id, title, type, narrative, image_url, created_at, user_id, profiles (username, type, avatar_url, municipal_districts!profiles_municipal_district_id_fkey (city), provincial_districts!profiles_provincial_district_id_fkey (province)), votes (issue_id, value), location_lat, location_lng, address, video_url, external_video_url, media_type, federal_district, municipal_district, provincial_district, topic, government_level, province, city`,
			)
			.eq("government_level", governmentLevel);

		// For provincial level with a province search, also filter issues by province
		if (governmentLevel === "provincial" && searchQuery) {
			issuesQuery = issuesQuery.ilike("province", `%${searchQuery}%`);
		}

		const { data: issuesData } = await issuesQuery;

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
	}, [governmentLevel, searchQuery]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Filter districts by search and province
	const filteredDistricts = districts.filter((d) => {
		if (!districtSearch.trim()) return true;
		const query = districtSearch.toLowerCase();
		return (
			d.name.toLowerCase().includes(query) ||
			(d.borough && d.borough.toLowerCase().includes(query))
		);
	});

	// Handle province filter change
	const handleProvinceChange = (value: string) => {
		setSelectedProvince(value);
		if (value === "all") {
			router.push(`/d/provincial`);
		} else {
			const provinceName = PROVINCES.find((p) => p.code === value)?.name || "";
			router.push(`/d/provincial?search=${encodeURIComponent(provinceName)}`);
		}
	};

	if (!governmentLevel) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-2">Invalid Government Level</h1>
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
								<h1 className="text-2xl font-bold">
									{searchQuery ?
										`${searchQuery} ${getLevelLabel(governmentLevel)} Issues`
									:	`All ${getLevelLabel(governmentLevel)} Issues`}
								</h1>
								<p className="text-sm text-gray-500">
									{levelDescriptions[governmentLevel]} • {issues.length} post
									{issues.length !== 1 ? "s" : ""}
								</p>
							</div>
						</div>
					</div>

					{/* Districts Browser */}
					<div className="bg-white rounded-xl border p-4 mb-6">
						<div className="flex items-center justify-between mb-3">
							<h2 className="text-sm font-semibold text-gray-700">
								Browse {getLevelLabel(governmentLevel)} Districts
							</h2>
							<span className="text-xs text-gray-400">
								{filteredDistricts.length} districts
							</span>
						</div>
						<div className="flex gap-2 mb-3">
							{governmentLevel === "provincial" && (
								<Select
									value={selectedProvince}
									onValueChange={handleProvinceChange}
								>
									<SelectTrigger className="w-[180px]">
										<SelectValue placeholder="Filter by province" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Provinces</SelectItem>
										{PROVINCES.map((p) => (
											<SelectItem key={p.code} value={p.code}>
												{p.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
							<div className="relative flex-1">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									type="text"
									placeholder={`Search ${governmentLevel} districts...`}
									value={districtSearch}
									onChange={(e) => setDistrictSearch(e.target.value)}
									className="pl-9"
								/>
							</div>
						</div>
						<div className="max-h-48 overflow-y-auto">
							<div className="grid grid-cols-2 md:grid-cols-3 gap-1">
								{filteredDistricts.slice(0, 30).map((district) => (
									<Link
										key={district.id}
										href={`/d/${governmentLevel}/${district.slug}`}
										className="px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded truncate"
										title={district.name}
									>
										{district.name}
									</Link>
								))}
							</div>
							{filteredDistricts.length > 30 && (
								<p className="text-xs text-gray-400 mt-2 text-center">
									+{filteredDistricts.length - 30} more districts
								</p>
							)}
							{districtSearch && filteredDistricts.length === 0 && (
								<p className="text-sm text-gray-400 text-center py-4">
									No districts match &quot;{districtSearch}&quot;
								</p>
							)}
						</div>
					</div>

					{/* Feed */}
					{issues.length === 0 ?
						<div className="text-center py-12 bg-white rounded-xl border">
							<Globe className="w-12 h-12 mx-auto text-gray-300 mb-3" />
							<p className="text-gray-500 mb-2">
								No {governmentLevel} posts yet.
							</p>
							<p className="text-sm text-gray-400 mb-4">
								Be the first to start a discussion about {governmentLevel}{" "}
								issues!
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
