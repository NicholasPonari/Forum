"use client";

import dynamic from "next/dynamic";
import { Header } from "@/components/page_components/header";
import { Skeleton } from "@/components/ui/skeleton";

const CommunityMap = dynamic(
	() =>
		import("@/components/CommunityMap").then((mod) => mod.CommunityMap),
	{
		ssr: false,
		loading: () => (
			<div className="flex-1 flex items-center justify-center">
				<Skeleton className="w-full h-full" />
			</div>
		),
	}
);

export default function CommunityPage() {
	return (
		<>
			<Header />
			<div className="h-[calc(100vh-4rem)]">
				<CommunityMap />
			</div>
		</>
	);
}
