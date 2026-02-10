"use client";

import { useState, useRef, useEffect } from "react";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { DistrictNav } from "@/components/DistrictNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FlaskConical, Loader2, AlertCircle, CheckCircle, FileText, Video } from "lucide-react";
import Link from "next/link";

type PipelineMode = "hansard" | "youtube";

export default function ParliamentDebateTestPage() {
	const [mode, setMode] = useState<PipelineMode>("hansard");
	const [sittingDate, setSittingDate] = useState("");
	const [youtubeUrl, setYoutubeUrl] = useState("");
	const [title, setTitle] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<{
		success: boolean;
		message?: string;
		debate_id?: string;
		sitting_date?: string;
		error?: string;
	} | null>(null);
	const headerLogoRef = useRef<HTMLDivElement>(null);
	const [scrollProgress, setScrollProgress] = useState(0);

	useEffect(() => {
		const handleScroll = () => {
			setScrollProgress(Math.min(Math.max(window.scrollY / 100, 0), 1));
		};
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setResult(null);
		setLoading(true);
		try {
			const endpoint =
				mode === "hansard"
					? "https://parliament-pipeline-production.up.railway.app/api/test-hansard"
					: "/api/debates/test";
			const body =
				mode === "hansard"
					? { sitting_date: sittingDate.trim(), title: title.trim() || undefined }
					: { youtubeUrl: youtubeUrl.trim(), title: title.trim() || undefined };

			const headers: Record<string, string> = { "Content-Type": "application/json" };
			
			// Add API key for Railway service endpoints
			if (mode === "hansard") {
				headers["x-api-key"] = "parliament1234%$";
			}

			const res = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok) {
				setResult({
					success: true,
					message: data.message ?? "Pipeline started.",
					debate_id: data.debate_id,
					sitting_date: data.sitting_date,
				});
				setSittingDate("");
				setYoutubeUrl("");
				setTitle("");
			} else {
				setResult({
					success: false,
					error: data.error ?? data.detail ?? `Request failed (${res.status})`,
				});
			}
		} catch (err) {
			setResult({
				success: false,
				error: err instanceof Error ? err.message : "Request failed",
			});
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<Header logoRef={headerLogoRef} logoOpacity={scrollProgress} />
			<div className="flex min-h-screen bg-gray-50">
				<aside className="hidden lg:block w-64 border-r bg-white shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
					<DistrictNav />
				</aside>
				<main className="flex-1 max-w-2xl mx-auto py-6 px-4">
					<div className="mb-6">
						<Link
							href="/actions/events"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
						>
							<ArrowLeft className="w-4 h-4" />
							Back to Parliamentary Debates
						</Link>
						<div className="flex items-center gap-3">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 text-amber-700">
								<FlaskConical className="w-5 h-5" />
							</div>
							<div>
								<h1 className="text-xl font-bold">Test Pipeline</h1>
								<p className="text-sm text-gray-500">
									Test the debate processing pipeline with Hansard or YouTube sources.
								</p>
							</div>
						</div>
					</div>

					{/* Mode selector */}
					<div className="flex gap-2 mb-6">
						<button
							type="button"
							onClick={() => { setMode("hansard"); setResult(null); }}
							className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
								mode === "hansard"
									? "bg-indigo-100 text-indigo-800 border border-indigo-200"
									: "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
							}`}
						>
							<FileText className="w-4 h-4" />
							Hansard (recommended)
						</button>
						<button
							type="button"
							onClick={() => { setMode("youtube"); setResult(null); }}
							className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
								mode === "youtube"
									? "bg-amber-100 text-amber-800 border border-amber-200"
									: "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
							}`}
						>
							<Video className="w-4 h-4" />
							YouTube (legacy)
						</button>
					</div>

					{mode === "hansard" ? (
						<div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 mb-6">
							<p className="text-sm text-indigo-800">
								<strong>Hansard-first pipeline:</strong> Enter a sitting date to scrape the official
								House of Commons transcript from ourcommons.ca. No video download or transcription
								needed — the professionals already did it. The pipeline will extract speakers, topics,
								and bill references, then generate a summary and publish forum posts.
							</p>
						</div>
					) : (
						<div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 mb-6">
							<p className="text-sm text-amber-800">
								<strong>Legacy video pipeline:</strong> Paste a YouTube URL to download audio,
								transcribe with Whisper, and publish. This is slower and more expensive — use the
								Hansard pipeline for federal debates instead.
							</p>
						</div>
					)}

					<form onSubmit={handleSubmit} className="space-y-4">
						{mode === "hansard" ? (
							<div>
								<Label htmlFor="sittingDate">Sitting Date *</Label>
								<Input
									id="sittingDate"
									type="date"
									value={sittingDate}
									onChange={(e) => setSittingDate(e.target.value)}
									className="mt-1"
									required
									disabled={loading}
								/>
								<p className="text-xs text-gray-500 mt-1">
									Pick a recent date when the House was sitting (weekdays only).
								</p>
							</div>
						) : (
							<div>
								<Label htmlFor="youtubeUrl">YouTube URL *</Label>
								<Input
									id="youtubeUrl"
									type="url"
									placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
									value={youtubeUrl}
									onChange={(e) => setYoutubeUrl(e.target.value)}
									className="mt-1"
									required
									disabled={loading}
								/>
							</div>
						)}
						<div>
							<Label htmlFor="title">Title (optional)</Label>
							<Input
								id="title"
								type="text"
								placeholder={
									mode === "hansard"
										? "e.g. House of Commons Debate — 2026-02-09"
										: "e.g. Test – Question Period clip"
								}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								className="mt-1"
								disabled={loading}
							/>
						</div>
						<Button type="submit" disabled={loading}>
							{loading ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Starting pipeline…
								</>
							) : mode === "hansard" ? (
								"Run Hansard pipeline"
							) : (
								"Run YouTube pipeline"
							)}
						</Button>
					</form>

					{result && (
						<div
							className={`mt-6 p-4 rounded-lg border ${
								result.success
									? "border-green-200 bg-green-50 text-green-800"
									: "border-red-200 bg-red-50 text-red-800"
							}`}
						>
							{result.success ? (
								<>
									<div className="flex items-center gap-2 font-medium">
										<CheckCircle className="w-5 h-5" />
										{result.message}
									</div>
									{result.debate_id && (
										<p className="mt-2 text-sm font-mono break-all">
											Debate ID: {result.debate_id}
										</p>
									)}
									{result.sitting_date && (
										<p className="mt-1 text-sm">
											Sitting date: {result.sitting_date}
										</p>
									)}
									<Link
										href="/actions/events"
										className="inline-block mt-3 text-sm font-medium underline"
									>
										View on Parliamentary Debates →
									</Link>
								</>
							) : (
								<>
									<div className="flex items-center gap-2 font-medium">
										<AlertCircle className="w-5 h-5" />
										Error
									</div>
									<p className="mt-2 text-sm">{result.error}</p>
								</>
							)}
						</div>
					)}
				</main>
			</div>
			<Footer />
		</>
	);
}
