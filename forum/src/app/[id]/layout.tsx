import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
	const { id } = await params;
	const supabase = await createServerSupabaseClient();
	const { data } = await supabase
		.from("issues")
		.select("title, narrative")
		.eq("id", id)
		.single();

	if (!data) {
		return {
			title: "Vox.Vote - Plan Together. Act.",
			description:
				"Plan together. Act together. Join Vox.Vote to share issues, discuss, and collaborate on solutions.",
		};
	}

	const title = data.title ? `Vox.Vote - ${data.title}` : "Vox.Vote";
	const descSource = (data.narrative || "").trim();
	const description = descSource
		? descSource.length > 160
			? `${descSource.slice(0, 157)}...`
			: descSource
		: "Discuss and collaborate on solutions with Vox.Vote.";

	return {
		title,
		description,
	};
}

export default function IssueLayout({ children }: { children: React.ReactNode }) {
	return children as React.ReactElement;
}
