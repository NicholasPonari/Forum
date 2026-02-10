"use client";

import { useState } from "react";
import { Header } from "@/components/page_components/header";
import { Footer } from "@/components/page_components/footer";
import { DistrictNav } from "@/components/DistrictNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FlaskConical, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { useEffect } from "react";

export default function ParliamentDebateTestPage() {
	const [youtubeUrl, setYoutubeUrl] = useState("");
	const [title, setTitle] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<{
		success: boolean;
		message?: string;
		debate_id?: string;
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
			const res = await fetch("/api/debates/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					youtubeUrl: youtubeUrl.trim(),
					title: title.trim() || undefined,
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok) {
				setResult({
					success: true,
					message: data.message ?? "Pipeline started.",
					debate_id: data.debate_id,
				});
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
								<h1 className="text-xl font-bold">Test pipeline (YouTube)</h1>
								<p className="text-sm text-gray-500">
									Create a single test debate from a YouTube link and run the full pipeline.
								</p>
							</div>
						</div>
					</div>

					<div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 mb-6">
						<p className="text-sm text-amber-800">
							This page is for testing only. Paste a YouTube URL (e.g. a short clip or a full
							sitting). The pipeline will download audio, transcribe, summarize, and publish a
							forum post as if it had just scraped this debate.
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
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
						<div>
							<Label htmlFor="title">Title (optional)</Label>
							<Input
								id="title"
								type="text"
								placeholder="e.g. Test – Question Period clip"
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
							) : (
								"Run test pipeline"
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
