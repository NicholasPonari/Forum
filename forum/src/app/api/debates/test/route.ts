import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const YOUTUBE_URL_REGEX =
	/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function normalizeBaseUrl(raw: string) {
	const trimmed = raw.trim().replace(/\/+$/, "");
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

function createSupabaseAdmin() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;
	return createClient(url, key, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const youtubeUrl = typeof body?.youtubeUrl === "string" ? body.youtubeUrl.trim() : "";
		const title = typeof body?.title === "string" ? body.title.trim() : undefined;

		if (!youtubeUrl) {
			return NextResponse.json(
				{ error: "youtubeUrl is required" },
				{ status: 400 }
			);
		}

		if (!YOUTUBE_URL_REGEX.test(youtubeUrl)) {
			return NextResponse.json(
				{ error: "Invalid YouTube URL. Use a watch link or youtu.be link." },
				{ status: 400 }
			);
		}

		const pipelineUrl = process.env.PARLIAMENT_PIPELINE_URL;
		const pipelineApiKey = process.env.PARLIAMENT_PIPELINE_API_KEY;

		// Prefer pipeline endpoint so it creates the debate and queues the job
		if (pipelineUrl && pipelineApiKey) {
			const baseUrl = normalizeBaseUrl(pipelineUrl);
			if (!baseUrl) {
				return NextResponse.json(
					{ error: "PARLIAMENT_PIPELINE_URL is set but empty/invalid." },
					{ status: 500 }
				);
			}

			const res = await fetch(`${baseUrl}/api/test-debate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": pipelineApiKey,
				},
				body: JSON.stringify({
					youtube_url: youtubeUrl,
					title: title || undefined,
				}),
			});

			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				return NextResponse.json(
					{ error: data?.detail ?? data?.message ?? "Pipeline request failed", code: res.status },
					{ status: res.status >= 500 ? 500 : 400 }
				);
			}

			return NextResponse.json({
				status: data.status ?? "queued",
				debate_id: data.debate_id,
				message: data.message ?? "Pipeline started. Check the events page for status.",
			});
		}

		// Fallback: create debate in Supabase so user can trigger pipeline manually (e.g. local)
		const supabase = createSupabaseAdmin();
		if (!supabase) {
			return NextResponse.json(
				{
					error: "Pipeline not configured and Supabase admin not available.",
					hint: "Set PARLIAMENT_PIPELINE_URL and PARLIAMENT_PIPELINE_API_KEY, or run the pipeline locally and point to it.",
				},
				{ status: 503 }
			);
		}

		const { data: leg } = await supabase
			.from("legislatures")
			.select("id")
			.eq("code", "CA")
			.single();

		if (!leg) {
			return NextResponse.json(
				{ error: "Legislature CA not found. Run the debate tables migration first." },
				{ status: 500 }
			);
		}

		const today = new Date().toISOString().slice(0, 10);
		const externalId = `test-yt-${today}-${Date.now() % 100000}`;

		const { data: debate, error } = await supabase
			.from("debates")
			.insert({
				legislature_id: leg.id,
				external_id: externalId,
				title: title ?? `Test debate (YouTube) – ${today}`,
				date: today,
				session_type: "house",
				status: "detected",
				video_url: youtubeUrl,
				source_urls: [
					{ type: "video", url: youtubeUrl, label: "YouTube (test)" },
				],
				metadata: { source: "test", youtube_url: youtubeUrl },
			})
			.select("id")
			.single();

		if (error) {
			return NextResponse.json(
				{ error: error.message },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			status: "created",
			debate_id: debate.id,
			message:
				"Debate created (pipeline not configured). Trigger the pipeline manually: POST /api/test-debate with this debate_id, or use retrigger with from_stage=detected.",
		});
	} catch (e) {
		console.error("Test debate API error:", e);
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Request failed" },
			{ status: 500 }
		);
	}
}
