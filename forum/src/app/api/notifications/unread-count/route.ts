import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		const supabase = await createServerSupabaseClient();
		
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		
		if (authError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		const { count, error: countError } = await supabase
			.from("notifications")
			.select("id", { count: "exact", head: true })
			.eq("user_id", user.id)
			.eq("is_read", false);

		if (countError) {
			console.error("Unread count query error:", countError);
			return NextResponse.json(
				{ error: "Failed to fetch unread count" },
				{ status: 500 }
			);
		}

		return NextResponse.json({ count: count || 0 });
	} catch (error) {
		console.error("Unread count error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
