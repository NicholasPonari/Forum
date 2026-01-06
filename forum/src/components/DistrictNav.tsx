"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Home,
	Layers,
	MapPin,
	Compass,
	Building2,
	Landmark,
	MapPinned,
	Globe,
	Building,
	Search,
	Loader2,
	Navigation,
	Menu,
	PanelLeftClose,
	Map,
	Users,
	Megaphone,
	CalendarDays,
	MessageSquare,
	FileText,
	Mail,
	Vote,
	Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	UserDistrictInfo,
	GovernmentLevel,
	ProfileLocation,
	MapDistrictData,
} from "@/lib/types/geo";
import { Issue, VoteBreakdown } from "@/lib/types/db";
import { toSlug, getLevelRoutePrefix } from "@/lib/districts";
import { TOPICS_LIST } from "@/lib/topics";
import { PROVINCES, GOVERNMENT_LEVELS } from "@/lib/constants/geography";
import { CollapsedNavItem, NavItem, LevelBadge } from "./district-nav/NavItems";
import { NavSectionHeader } from "./district-nav/NavSectionHeader";
import { DistrictNavSkeleton } from "./district-nav/DistrictNavSkeleton";
import dynamic from "next/dynamic";
import { useTranslation } from "@/hooks/use-translation";

// Dynamically import MapDrawer to avoid SSR issues with Leaflet
const MapDrawer = dynamic(
	() => import("@/components/MapDrawer").then((mod) => mod.MapDrawer),
	{ ssr: false }
);

// Types
interface DistrictNavProps {
	className?: string;
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
	issues?: Issue[];
	voteBreakdown?: VoteBreakdown;
	// New props
	userDistricts?: UserDistrictInfo | null;
	mapDistricts?: MapDistrictData | null;
	profileLocation?: ProfileLocation | null;
}

export function DistrictNav({
	className,
	collapsed = false,
	onCollapsedChange,
	issues = [],
	voteBreakdown = {},
	userDistricts,
	mapDistricts,
	profileLocation,
}: DistrictNavProps) {
	const pathname = usePathname();
	const { user, loading } = useAuth();
	const { t } = useTranslation();

	// Only one section can be open at a time
	const [openSection, setOpenSection] = useState<
		"issues" | "places" | "myCivicMap" | "actions" | null
	>("myCivicMap");

	// Map drawer state
	const [mapDrawerOpen, setMapDrawerOpen] = useState(false);

	// Search
	const [placeSearch, setPlaceSearch] = useState("");

	// Selected filters within Issues
	const [selectedIssuesLevel, setSelectedIssuesLevel] =
		useState<GovernmentLevel>("federal");
	const [selectedProvinceCode, setSelectedProvinceCode] =
		useState<string>("all");

	// Auto-select province based on user location
	useEffect(() => {
		if (userDistricts?.province && selectedProvinceCode === "all") {
			const match = PROVINCES.find((p) => p.name === userDistricts.province);
			if (match) setSelectedProvinceCode(match.code);
		}
	}, [userDistricts?.province, selectedProvinceCode]);

	// Filter topics by search
	const filteredProvinces = useMemo(() => {
		if (!placeSearch.trim()) return PROVINCES;
		return PROVINCES.filter(
			(p) =>
				p.name.toLowerCase().includes(placeSearch.toLowerCase()) ||
				p.code.toLowerCase().includes(placeSearch.toLowerCase())
		);
	}, [placeSearch]);

	// Check if path is active
	const isPathActive = (path: string) =>
		pathname === path || pathname.startsWith(path + "/");

	// Has user location set
	const hasUserLocation =
		userDistricts?.federal ||
		userDistricts?.provincial ||
		userDistricts?.municipal;

	const userCity = userDistricts?.city;
	const userProvince = userDistricts?.province;

	// Collapsed view
	if (loading) {
		return <DistrictNavSkeleton collapsed={collapsed} className={className} />;
	}

	if (collapsed) {
		return (
			<TooltipProvider delayDuration={0}>
				<div
					className={cn(
						"flex flex-col h-full bg-background border-r",
						className
					)}
				>
					{/* Header with expand toggle */}
					<div className="flex items-center justify-center px-2 py-2 border-b shrink-0">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => onCollapsedChange?.(false)}
									className="h-9 w-9 rounded-full border text-muted-foreground hover:text-foreground"
								>
									<Menu className="w-4 h-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{t.nav.expandSidebar}
							</TooltipContent>
						</Tooltip>
					</div>

					<div className="flex flex-col items-center py-4 space-y-2">
						<CollapsedNavItem
							href="/"
							icon={Home}
							label={t.nav.home}
							isActive={pathname === "/"}
						/>
						<CollapsedNavItem
							href="/d/federal"
							icon={Layers}
							label={t.nav.federal}
							isActive={isPathActive("/d/federal")}
						/>
						<CollapsedNavItem
							href="/d/provincial"
							icon={Landmark}
							label={t.nav.provincial}
							isActive={isPathActive("/d/provincial")}
						/>
						<CollapsedNavItem
							href="/d/municipal"
							icon={MapPinned}
							label={t.nav.municipal}
							isActive={isPathActive("/d/municipal")}
						/>
						<CollapsedNavItem
							href="/about"
							icon={Compass}
							label={t.nav.about}
							isActive={isPathActive("/about")}
						/>
					</div>

					<div className="flex-1" />
				</div>
			</TooltipProvider>
		);
	}

	return (
		<div
			className={cn("relative flex flex-col h-full bg-background", className)}
		>
			{/* Home */}
			<NavItem href="/" icon={Home} label={t.nav.home} isActive={pathname === "/"} />
			{/* Header with collapse toggle */}
			{onCollapsedChange && (
				<div className="relative flex items-center justify-end px-2 border-b shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="absolute -right-3 top-2 z-10 h-6 w-6 rounded-full border bg-background shadow-sm hover:bg-accent"
						onClick={() => onCollapsedChange(true)}
					>
						<PanelLeftClose className="w-3 h-3" />
					</Button>
				</div>
			)}
			<ScrollArea className="flex-1">
				<div className="py-2 px-2 space-y-1">
					{/* Issues - Topic First View */}
					<Collapsible
						open={openSection === "issues"}
						onOpenChange={(open) => setOpenSection(open ? "issues" : null)}
					>
						<CollapsibleTrigger asChild>
							<NavSectionHeader
								icon={Layers}
								label={t.nav.issues}
								isOpen={openSection === "issues"}
								onToggle={() =>
									setOpenSection(openSection === "issues" ? null : "issues")
								}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="pl-2 mt-1 space-y-1 overflow-x-hidden">
								<Tabs
									value={selectedIssuesLevel}
									onValueChange={(value) =>
										setSelectedIssuesLevel(value as GovernmentLevel)
									}
									className="px-2 py-1"
								>
									<TabsList className="grid grid-cols-3 h-8">
										<TabsTrigger value="federal" className="text-xs">
											{t.nav.federal}
										</TabsTrigger>
										<TabsTrigger value="provincial" className="text-xs">
											{t.nav.provincial}
										</TabsTrigger>
										<TabsTrigger value="municipal" className="text-xs">
											{t.nav.municipal}
										</TabsTrigger>
									</TabsList>
									<TabsContent value="federal" className="mt-2 space-y-1">
										{TOPICS_LIST.map((topic) => (
											<NavItem
												key={topic.id}
												href={`/issues/${topic.id}?level=federal`}
												icon={topic.icon}
												label={t.topics[topic.id as keyof typeof t.topics] || topic.label}
												isActive={isPathActive(`/issues/${topic.id}`)}
												indent
											/>
										))}
									</TabsContent>
									<TabsContent value="provincial" className="mt-2 space-y-2">
										<div className="px-2">
											<div className="flex items-center justify-between mb-2">
												<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
													{t.places.province}
												</p>
											</div>
											<Select
												value={selectedProvinceCode}
												onValueChange={setSelectedProvinceCode}
											>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue
														placeholder={userProvince || t.places.allProvinces}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">{t.places.allProvinces}</SelectItem>
													{PROVINCES.map((p) => (
														<SelectItem key={p.code} value={p.code}>
															{p.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										{TOPICS_LIST.map((topic) => {
											const selectedProvinceName =
												selectedProvinceCode === "all"
													? null
													: PROVINCES.find(
														(p) => p.code === selectedProvinceCode
													)?.name ?? null;
											const provinceParam = selectedProvinceName
												? `&province=${encodeURIComponent(
													selectedProvinceName
												)}`
												: "";

											return (
												<NavItem
													key={topic.id}
													href={`/issues/${topic.id}?level=provincial${provinceParam}`}
													icon={topic.icon}
													label={t.topics[topic.id as keyof typeof t.topics] || topic.label}
													isActive={isPathActive(`/issues/${topic.id}`)}
													indent
												/>
											);
										})}
									</TabsContent>
									<TabsContent value="municipal" className="mt-2 space-y-2">
										<div className="px-2">
											<div className="flex items-center justify-between">
												<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
													{t.places.city}
												</p>
											</div>
											<p className="text-xs text-foreground mt-1">
												{userCity || t.places.chooseCity}
											</p>
										</div>
										{TOPICS_LIST.map((topic) => {
											const cityParam = userCity
												? `&city=${encodeURIComponent(userCity)}`
												: "";
											return (
												<NavItem
													key={topic.id}
													href={`/issues/${topic.id}?level=municipal${cityParam}`}
													icon={topic.icon}
													label={t.topics[topic.id as keyof typeof t.topics] || topic.label}
													isActive={isPathActive(`/issues/${topic.id}`)}
													indent
												/>
											);
										})}
									</TabsContent>
								</Tabs>

								{/* View All Link */}
								<Link
									href="/issues"
									className="flex items-center px-3 py-1.5 ml-6 text-xs text-primary hover:underline"
								>
									{t.nav.viewAllIssues} →
								</Link>
							</div>
						</CollapsibleContent>
					</Collapsible>

					{/* Places - Geography First View */}
					<Collapsible
						open={openSection === "places"}
						onOpenChange={(open) => setOpenSection(open ? "places" : null)}
					>
						<CollapsibleTrigger asChild>
							<NavSectionHeader
								icon={MapPin}
								label={t.nav.places}
								isOpen={openSection === "places"}
								onToggle={() =>
									setOpenSection(openSection === "places" ? null : "places")
								}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="ml-2 mt-1 space-y-1">
								{/* Search */}
								<div className="px-2 pb-2">
									<div className="relative">
										<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
										<Input
											type="text"
											placeholder={t.places.searchPlaceholder}
											value={placeSearch}
											onChange={(e) => setPlaceSearch(e.target.value)}
											className="h-8 pl-8 text-xs"
										/>
									</div>
								</div>

								{/* Canada / Federal */}
								<NavItem
									href="/d/federal"
									icon={Globe}
									label={t.places.canadaFederal}
									isActive={isPathActive("/d/federal")}
									indent
								/>

								{/* Province Quick Links */}
								<div className="px-3 py-1">
									<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
										{t.places.provincesTerritories}
									</p>
								</div>
								{filteredProvinces.slice(0, 6).map((province) => (
									<NavItem
										key={province.code}
										href={`/d/provincial?search=${encodeURIComponent(
											province.name
										)}`}
										label={province.name}
										isActive={isPathActive(
											`/places/${province.code.toLowerCase()}`
										)}
										indent
									/>
								))}
								{filteredProvinces.length > 6 && (
									<Link
										href="/d/provincial"
										className="flex items-center px-3 py-1.5 ml-6 text-xs text-primary hover:underline"
									>
										+{filteredProvinces.length - 6} {t.places.more} →
									</Link>
								)}

								{/* Government Level Links */}
								<div className="px-3 py-1 mt-2">
									<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
										{t.places.byGovLevel}
									</p>
								</div>
								{GOVERNMENT_LEVELS.map(({ level, label, icon: Icon }) => (
									<NavItem
										key={level}
										href={`/d/${level}`}
										icon={Icon}
										label={t.places.allDistricts.replace("{level}", label)}
										isActive={isPathActive(`/d/${level}`)}
										indent
									/>
								))}
							</div>
						</CollapsibleContent>
					</Collapsible>

					{/* My Civic Map - Personalized */}
					<Collapsible
						open={openSection === "myCivicMap"}
						onOpenChange={(open) => setOpenSection(open ? "myCivicMap" : null)}
					>
						<CollapsibleTrigger asChild>
							<NavSectionHeader
								icon={Compass}
								label={t.nav.myCivicMap}
								isOpen={openSection === "myCivicMap"}
								onToggle={() =>
									setOpenSection(
										openSection === "myCivicMap" ? null : "myCivicMap"
									)
								}
								badge={
									user && !userDistricts
										? undefined
										: hasUserLocation
											? undefined
											: t.civicMap.forMembers
								}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="ml-2 mt-1 space-y-1">
								{user && !userDistricts && !hasUserLocation ? (
									<div className="flex items-center justify-center py-4">
										<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
									</div>
								) : !user ? (
									<div className="px-4 py-3 text-xs text-muted-foreground text-center">
										<Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
										<p className="font-medium text-foreground">
											{t.civicMap.signInRequired}
										</p>
										<p className="mt-1">{t.civicMap.signInPrompt}</p>
									</div>
								) : !hasUserLocation ? (
									<div className="px-4 py-3 text-xs text-muted-foreground text-center">
										<MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
										<p className="font-medium text-foreground">
											{t.civicMap.locationNotSet}
										</p>
										<p className="mt-1">
											{t.civicMap.updateProfilePrompt}
										</p>
										<Button
											variant="outline"
											size="sm"
											className="mt-2 h-7 text-xs"
											asChild
										>
											<Link href={`/profile/${user.id}`}>
												<Navigation className="w-3 h-3 mr-1" />
												{t.civicMap.setLocation}
											</Link>
										</Button>
									</div>
								) : (
									<>
										{/* View on Map Button */}
										<Button
											variant="outline"
											size="sm"
											className="w-32 h-8 text-xs mb-3"
											onClick={() => setMapDrawerOpen(true)}
										>
											<Map className="w-3.5 h-3.5 mr-2" />
											{t.common.viewOnMap}
										</Button>

										{/* My Federal Riding */}
										{userDistricts.federal && (
											<div className="space-y-0.5">
												<div className="flex items-center gap-2 px-3 py-1">
													<LevelBadge level="federal" />
													<span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
														{t.civicMap.myFederalRiding}
													</span>
												</div>
												<NavItem
													href={`${getLevelRoutePrefix("federal")}/${toSlug(
														userDistricts.federal
													)}`}
													icon={Building2}
													label={userDistricts.federal}
													isActive={isPathActive(
														`${getLevelRoutePrefix("federal")}/${toSlug(
															userDistricts.federal
														)}`
													)}
													indent
												/>
											</div>
										)}

										{/* My Provincial Riding */}
										{userDistricts.provincial && (
											<div className="space-y-0.5 mt-2">
												<div className="flex items-center gap-2 px-3 py-1">
													<LevelBadge level="provincial" />
													<span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
														{t.civicMap.myProvincialRiding}
													</span>
												</div>
												<NavItem
													href={`${getLevelRoutePrefix("provincial")}/${toSlug(
														userDistricts.provincial
													)}`}
													icon={Landmark}
													label={userDistricts.provincial}
													isActive={isPathActive(
														`${getLevelRoutePrefix("provincial")}/${toSlug(
															userDistricts.provincial
														)}`
													)}
													indent
												/>
											</div>
										)}

										{/* My Borough (if applicable) */}
										{userDistricts.municipalBorough && (
											<div className="space-y-0.5 mt-2">
												<div className="flex items-center gap-2 px-3 py-1">
													<LevelBadge level="municipal" />
													<span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
														{t.civicMap.myBorough}
													</span>
												</div>
												<NavItem
													href={`${getLevelRoutePrefix("municipal")}/${toSlug(
														userDistricts.municipalBorough
													)}`}
													icon={Building}
													label={userDistricts.municipalBorough}
													isActive={isPathActive(
														`${getLevelRoutePrefix("municipal")}/${toSlug(
															userDistricts.municipalBorough
														)}`
													)}
													indent
												/>
											</div>
										)}

										{/* My Municipal Ward */}
										{userDistricts.municipal && (
											<div className="space-y-0.5 mt-2">
												<div className="flex items-center gap-2 px-3 py-1">
													<LevelBadge level="municipal" />
													<span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
														{t.civicMap.myWard}
													</span>
												</div>
												<NavItem
													href={`${getLevelRoutePrefix("municipal")}/${toSlug(
														userDistricts.municipal
													)}`}
													icon={MapPinned}
													label={userDistricts.municipal}
													isActive={isPathActive(
														`${getLevelRoutePrefix("municipal")}/${toSlug(
															userDistricts.municipal
														)}`
													)}
													indent
												/>
											</div>
										)}
									</>
								)}
							</div>
						</CollapsibleContent>
					</Collapsible>

					{/* Actions - Civic Engagement */}
					<Collapsible
						open={openSection === "actions"}
						onOpenChange={(open) => setOpenSection(open ? "actions" : null)}
					>
						<CollapsibleTrigger asChild>
							<NavSectionHeader
								icon={Megaphone}
								label="Actions"
								isOpen={openSection === "actions"}
								onToggle={() =>
									setOpenSection(openSection === "actions" ? null : "actions")
								}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="ml-2 mt-1 space-y-1">
								<NavItem
									href="/actions/events"
									icon={CalendarDays}
									label="Upcoming Events"
									isActive={isPathActive("/actions/events")}
									indent
								/>
								<NavItem
									href="/actions/consultations"
									icon={MessageSquare}
									label="Consultations"
									isActive={isPathActive("/actions/consultations")}
									indent
								/>
								<NavItem
									href="/actions/petitions"
									icon={FileText}
									label="Petitions"
									isActive={isPathActive("/actions/petitions")}
									indent
								/>
								<NavItem
									href="/actions/contact"
									icon={Mail}
									label="Contact Your Rep"
									isActive={isPathActive("/actions/contact")}
									indent
								/>
								<NavItem
									href="/actions/elections"
									icon={Vote}
									label="Elections & Voting"
									isActive={isPathActive("/actions/elections")}
									indent
								/>
							</div>
						</CollapsibleContent>
					</Collapsible>
				</div>
			</ScrollArea>

			{/* Submit Feature Idea - Outside collapsible */}
			<div className="border-t px-2 py-3 shrink-0">
				<NavItem
					href="/feedback"
					icon={Lightbulb}
					label={t.nav.submitIdea}
					isActive={isPathActive("/feedback")}
				/>
			</div>

			{/* Map Drawer */}
			<MapDrawer
				isOpen={mapDrawerOpen}
				onClose={() => setMapDrawerOpen(false)}
				issues={issues}
				hoveredIssue={null}
				voteBreakdown={voteBreakdown}
				onIssueHover={() => { }}
				profileLocation={profileLocation}
				districts={mapDistricts}
			/>
		</div>
	);
}
