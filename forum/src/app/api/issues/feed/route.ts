import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const limitRaw = searchParams.get("limit");
		const limit = Math.min(
			Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1),
			100,
		);

		const supabase = await createServerSupabaseClient();

		const { data: issues, error } = await supabase
			.from("issues")
			.select(
				`id, title, type, narrative, image_url, created_at, user_id, profiles (username, type, avatar_url, municipal_districts!profiles_municipal_district_id_fkey (city), provincial_districts!profiles_provincial_district_id_fkey (province)), location_lat, location_lng, address, video_url, media_type, federal_district, municipal_district, provincial_district, topic, government_level`,
			)
			.order("created_at", { ascending: false })
			.limit(limit);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		const issuesWithUsernames = (issues || []).map((issue) => {
			const profile = Array.isArray(issue.profiles)
				? issue.profiles[0]
				: issue.profiles;
			const municipalDistrict = Array.isArray(profile?.municipal_districts)
				? profile.municipal_districts[0]
				: profile?.municipal_districts;
			const provincialDistrict = Array.isArray(profile?.provincial_districts)
				? profile.provincial_districts[0]
				: profile?.provincial_districts;

			return {
				...issue,
				username: profile?.username || null,
				user_role: profile?.type || null,
				avatar_url: profile?.avatar_url || null,
				author_city: municipalDistrict?.city ?? null,
				author_province: provincialDistrict?.province ?? null,
			};
		});

		const issueIds = issuesWithUsernames.map((i) => i.id);

		let votes: Array<{ issue_id: string; value: number }> = [];
		if (issueIds.length > 0) {
			const { data: votesData } = await supabase
				.from("votes")
				.select("issue_id, value")
				.in("issue_id", issueIds);
			votes = (votesData || []) as typeof votes;
		}

		let comments: Array<{ issue_id: string }> = [];
		if (issueIds.length > 0) {
			const { data: commentsData } = await supabase
				.from("comments")
				.select("issue_id")
				.in("issue_id", issueIds);
			comments = (commentsData || []) as typeof comments;
		}

		return NextResponse.json({ issues: issuesWithUsernames, votes, comments });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
