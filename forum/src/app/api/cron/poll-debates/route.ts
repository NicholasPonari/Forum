import { NextResponse } from "next/server";

/**
 * Cron endpoint to trigger the Parliament Pipeline's debate polling.
 * Called every 30 minutes by Vercel cron (configured in vercel.json).
 *
 * This route forwards the poll request to the Railway-hosted Python pipeline service.
 */
export async function GET() {
	const pipelineUrl = process.env.PARLIAMENT_PIPELINE_URL;
	const pipelineApiKey = process.env.PARLIAMENT_PIPELINE_API_KEY;

	if (!pipelineUrl || !pipelineApiKey) {
		console.warn("Parliament pipeline not configured (missing PARLIAMENT_PIPELINE_URL or PARLIAMENT_PIPELINE_API_KEY)");
		return NextResponse.json(
			{ status: "skipped", reason: "Pipeline not configured" },
			{ status: 200 }
		);
	}

	try {
		const response = await fetch(`${pipelineUrl}/api/poll`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": pipelineApiKey,
			},
			body: JSON.stringify({}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Pipeline poll failed: ${response.status} ${errorText}`);
			return NextResponse.json(
				{ status: "error", code: response.status, message: errorText },
				{ status: 500 }
			);
		}

		const result = await response.json();
		console.log("Parliament pipeline poll triggered:", result);

		return NextResponse.json({
			status: "success",
			result,
			triggered_at: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Failed to trigger parliament pipeline:", error);
		return NextResponse.json(
			{ status: "error", message: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 }
		);
	}
}
