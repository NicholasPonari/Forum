"use client";

import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/page_components/header";
import Issues from "@/components/page_components/issues";
import { Footer } from "@/components/page_components/footer";
import { Skeleton } from "@/components/ui/skeleton";
import { DistrictNav } from "@/components/DistrictNav";
import { RepresentativesInfo } from "@/components/RepresentativesInfo";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Users } from "lucide-react";
import { useUserDistricts } from "@/hooks/use-user-districts";
import { useIssues } from "@/hooks/use-issues";
import { useScroll, useTransform } from "framer-motion";
import { useTranslation } from "@/hooks/use-translation";

export default function HomePage() {
	const { t } = useTranslation();
	const {
		issues,
		votes,
		voteBreakdown,
		commentsCount,
		loading: issuesLoading,
	} = useIssues();
	const { userDistricts, mapDistricts, profileLocation } = useUserDistricts();

	const headerLogoRef = useRef<HTMLDivElement>(null);
	const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
	const [leftSheetOpen, setLeftSheetOpen] = useState(false);
	const [rightSheetOpen, setRightSheetOpen] = useState(false);
	const [isDesktop, setIsDesktop] = useState(false);

	// Framer Motion scroll hooks
	const { scrollY } = useScroll();

	// Logo opacity: start fading in at 50px, full at 150px
	const logoOpacity = useTransform(scrollY, [50, 150], [0, 1]);

	// Header border opacity: 0 to 1 over 0-150px
	const headerOpacity = useTransform(scrollY, [0, 150], [0, 1]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(min-width: 1024px)");
		const handleChange = (event: MediaQueryListEvent) => {
			setIsDesktop(event.matches);
		};

		setIsDesktop(mediaQuery.matches);
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	// Combined loading state - mainly waiting for issues as that's the primary content
	// District info can load progressively
	const isLoading = issuesLoading;

	return isLoading ? (
		<>
			<Header
				logoRef={headerLogoRef}
				logoOpacity={logoOpacity}
				headerOpacity={headerOpacity}
			/>
			<div className="flex min-h-screen">
				<aside className="hidden lg:block w-64 border-r bg-white shrink-0">
					<Skeleton className="h-full" />
				</aside>
				<main className="flex-1">
					<Skeleton className="h-12 m-6" />
				</main>
				<aside className="hidden lg:block w-72 border-l bg-white shrink-0">
					<Skeleton className="h-full" />
				</aside>
			</div>
		</>
	) : (
		<>
			<Header
				logoRef={headerLogoRef}
				logoOpacity={logoOpacity}
				headerOpacity={headerOpacity}
			/>
			<div className="flex min-h-screen bg-gray-50">
				{!isDesktop && (
					<>
						<div className="fixed bottom-4 left-4 z-40">
							<Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
								<SheetTrigger asChild>
									<Button
										size="icon"
										className="rounded-full shadow-lg h-12 w-12"
									>
										<Menu className="w-5 h-5" />
									</Button>
								</SheetTrigger>
								<SheetContent side="left" className="w-72 p-0">
									<SheetHeader className="border-b px-4 py-3">
										<SheetTitle>Districts</SheetTitle>
									</SheetHeader>
									<DistrictNav
										className="h-[calc(100vh-4rem)]"
										issues={issues}
										voteBreakdown={voteBreakdown}
										userDistricts={userDistricts}
										mapDistricts={mapDistricts}
										profileLocation={profileLocation}
									/>
								</SheetContent>
							</Sheet>
						</div>

						<div className="fixed bottom-4 right-4 z-40">
							<Sheet open={rightSheetOpen} onOpenChange={setRightSheetOpen}>
								<SheetTrigger asChild>
									<Button
										size="icon"
										variant="secondary"
										className="rounded-full shadow-lg h-12 w-12"
									>
										<Users className="w-5 h-5" />
									</Button>
								</SheetTrigger>
								<SheetContent side="right" className="w-80 p-0">
									<SheetHeader className="border-b px-4 py-3">
										<SheetTitle>{t.nav.representatives}</SheetTitle>
									</SheetHeader>
									<RepresentativesInfo
										className="h-[calc(100vh-4rem)]"
										userDistricts={userDistricts}
									/>
								</SheetContent>
							</Sheet>
						</div>
					</>
				)}

				{isDesktop && (
					<aside
						className={`border-r bg-white shrink-0 sticky top-16 h-[calc(100vh-4rem)] transition-all duration-300 z-20 ${
							leftSidebarCollapsed ? "w-14" : "w-64"
						}`}
					>
						<DistrictNav
							collapsed={leftSidebarCollapsed}
							onCollapsedChange={setLeftSidebarCollapsed}
							issues={issues}
							voteBreakdown={voteBreakdown}
							userDistricts={userDistricts}
							mapDistricts={mapDistricts}
							profileLocation={profileLocation}
						/>
					</aside>
				)}

				{/* Main Content */}
				<main className="flex-1 min-w-0">
					<Issues
						issues={issues}
						votes={votes}
						voteBreakdown={voteBreakdown}
						commentsCount={commentsCount}
						headerLogoRef={headerLogoRef}
						userDistricts={userDistricts}
						mapDistricts={mapDistricts}
						profileLocation={profileLocation}
					/>
				</main>

				{isDesktop && (
					<aside className="w-72 border-l bg-white shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
						<RepresentativesInfo userDistricts={userDistricts} />
					</aside>
				)}
			</div>
			<Footer />
		</>
	);
}
