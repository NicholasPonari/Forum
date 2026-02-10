"use client";

import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { DistrictNav } from "@/components/DistrictNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	ArrowLeft,
	CalendarDays,
	Clock,
	ExternalLink,
	Landmark,
	Play,
	FileText,
	Globe,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabaseClient";
import type { Debate, Legislature } from "@/lib/types/db";

const SESSION_TYPE_LABELS: Record<string, string> = {
	house: "House Debate",
	committee: "Committee Meeting",
	question_period: "Question Period",
	emergency: "Emergency Debate",
	other: "Session",
};

const STATUS_STYLES: Record<string, string> = {
	published: "bg-green-100 text-green-700",
	processing: "bg-blue-100 text-blue-700",
	transcribing: "bg-yellow-100 text-yellow-700",
	detected: "bg-gray-100 text-gray-600",
	error: "bg-red-100 text-red-700",
};

interface DebateWithLegislature extends Debate {
	legislatures: Legislature;
}

export default function EventsPage() {
	const [loading, setLoading] = useState(true);
	const [debates, setDebates] = useState<DebateWithLegislature[]>([]);
	const [filter, setFilter] = useState<string>("all");
	const [scrollProgress, setScrollProgress] = useState(0);
	const headerLogoRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleScroll = () => {
			const scrollY = window.scrollY;
			const progress = Math.min(Math.max(scrollY / 100, 0), 1);
			setScrollProgress(progress);
		};
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	useEffect(() => {
		async function fetchDebates() {
			try {
				const supabase = createClient();
				const query = supabase
					.from("debates")
					.select("*, legislatures(*)")
					.order("date", { ascending: false })
					.limit(50);

				const { data, error } = await query;

				if (error) {
					console.error("Error fetching debates:", error);
					setDebates([]);
				} else {
					setDebates((data as DebateWithLegislature[]) || []);
				}
			} catch (err) {
				console.error("Failed to fetch debates:", err);
				setDebates([]);
			} finally {
				setLoading(false);
			}
		}

		fetchDebates();
	}, []);

	const filteredDebates = debates.filter((debate) => {
		if (filter === "all") return true;
		if (filter === "federal") return debate.legislatures?.level === "federal";
		if (filter === "provincial") return debate.legislatures?.level === "provincial";
		if (filter === "published") return debate.status === "published";
		return true;
	});

	function formatDuration(seconds: number | null | undefined): string {
		if (!seconds) return "";
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	function formatDate(dateStr: string): string {
		try {
			const d = new Date(dateStr + "T00:00:00");
			return d.toLocaleDateString("en-CA", {
				weekday: "short",
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return dateStr;
		}
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
							{[1, 2, 3, 4].map((i) => (
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
				<aside className="hidden lg:block w-64 border-r bg-white shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
					<DistrictNav />
				</aside>

				<main className="flex-1 max-w-4xl mx-auto py-6 px-4">
					<div className="mb-6">
						<Link
							href="/"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
						>
							<ArrowLeft className="w-4 h-4" />
							Back to home
						</Link>
						<div className="flex items-center gap-3">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 text-amber-700">
								<Landmark className="w-5 h-5" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Parliamentary Debates</h1>
								<p className="text-sm text-gray-500">
									Automated summaries of House debates, committee meetings, and question periods
								</p>
							</div>
						</div>
					</div>

					{/* Filter bar */}
					<div className="flex gap-2 mb-6 overflow-x-auto pb-1">
						{[
							{ key: "all", label: "All Debates" },
							{ key: "federal", label: "Federal" },
							{ key: "provincial", label: "Provincial" },
							{ key: "published", label: "Published" },
						].map((f) => (
							<Button
								key={f.key}
								variant={filter === f.key ? "default" : "outline"}
								size="sm"
								className="rounded-full whitespace-nowrap"
								onClick={() => setFilter(f.key)}
							>
								{f.label}
							</Button>
						))}
					</div>

					{/* Debates list */}
					{filteredDebates.length === 0 && !loading && (
						<div className="text-center py-12 bg-white rounded-xl border">
							<Landmark className="w-12 h-12 mx-auto text-gray-300 mb-3" />
							<p className="text-gray-500 mb-2">No debates found</p>
							<p className="text-sm text-gray-400">
								{debates.length === 0
									? "The debate tracking pipeline will populate this page automatically as new parliamentary sessions are processed."
									: "Try a different filter to see more debates."}
							</p>
						</div>
					)}

					<div className="space-y-3">
						{filteredDebates.map((debate) => (
							<div
								key={debate.id}
								className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="flex-1 min-w-0">
										{/* Badges */}
										<div className="flex flex-wrap items-center gap-2 mb-2">
											<Badge
												className={cn(
													"text-xs",
													debate.legislatures?.level === "federal"
														? "bg-blue-100 text-blue-700"
														: "bg-purple-100 text-purple-700"
												)}
											>
												<Globe className="w-3 h-3 mr-1" />
												{debate.legislatures?.code || "??"}
											</Badge>
											<Badge variant="outline" className="text-xs capitalize">
												{SESSION_TYPE_LABELS[debate.session_type] || debate.session_type}
											</Badge>
											<Badge
												className={cn(
													"text-xs",
													STATUS_STYLES[debate.status] || "bg-gray-100 text-gray-600"
												)}
											>
												{debate.status}
											</Badge>
										</div>

										{/* Title */}
										<h3 className="font-semibold text-base text-gray-900 line-clamp-2">
											{debate.title}
										</h3>

										{/* Meta info */}
										<div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
											<span className="flex items-center gap-1">
												<CalendarDays className="w-4 h-4" />
												{formatDate(debate.date)}
											</span>
											{debate.duration_seconds && (
												<span className="flex items-center gap-1">
													<Clock className="w-4 h-4" />
													{formatDuration(debate.duration_seconds)}
												</span>
											)}
											<span className="text-xs text-gray-400">
												{debate.legislatures?.name}
											</span>
										</div>
									</div>

									{/* Action buttons */}
									<div className="flex flex-col gap-2 shrink-0">
										{debate.status === "published" && (
											<Button variant="default" size="sm" asChild>
												<Link href={`/?q=${encodeURIComponent(debate.title)}`}>
													<FileText className="w-4 h-4 mr-1" />
													View Post
												</Link>
											</Button>
										)}
										{debate.video_url && (
											<Button variant="outline" size="sm" asChild>
												<a
													href={debate.video_url}
													target="_blank"
													rel="noopener noreferrer"
												>
													<Play className="w-4 h-4 mr-1" />
													Video
												</a>
											</Button>
										)}
										{debate.hansard_url && (
											<Button variant="outline" size="sm" asChild>
												<a
													href={debate.hansard_url}
													target="_blank"
													rel="noopener noreferrer"
												>
													<ExternalLink className="w-4 h-4 mr-1" />
													Hansard
												</a>
											</Button>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</main>
			</div>
			<Footer />
		</>
	);
}
