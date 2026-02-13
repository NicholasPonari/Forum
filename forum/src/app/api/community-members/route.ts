import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Use service role to read all profiles, but only return jittered coords
const supabaseAdmin = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Jitter coordinates by ~1-3 km randomly so exact location is never exposed
function jitterCoord(lat: number, lng: number): { lat: number; lng: number } {
	const jitterKm = 1 + Math.random() * 2; // 1-3 km
	const angle = Math.random() * 2 * Math.PI;
	const dLat = (jitterKm / 111) * Math.cos(angle);
	const dLng =
		(jitterKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
	return {
		lat: lat + dLat,
		lng: lng + dLng,
	};
}

export async function GET() {
	try {
		const { data, error } = await supabaseAdmin
			.from("profiles")
			.select("coord")
			.not("coord", "is", null);

		if (error) {
			console.error("Error fetching community members:", error);
			return NextResponse.json({ members: [] }, { status: 500 });
		}

		const members: { lat: number; lng: number }[] = [];

		for (const profile of data || []) {
			let coord = profile.coord;
			if (typeof coord === "string") {
				try {
					coord = JSON.parse(coord);
				} catch {
					continue;
				}
			}
			if (coord?.lat && coord?.lng) {
				const jittered = jitterCoord(coord.lat, coord.lng);
				members.push(jittered);
			}
		}

		return NextResponse.json(
			{ members, total: members.length },
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
				},
			}
		);
	} catch (err) {
		console.error("Community members API error:", err);
		return NextResponse.json({ members: [] }, { status: 500 });
	}
}
