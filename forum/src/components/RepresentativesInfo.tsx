"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, ChevronDown, Home, MapPin, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { UserDistrictInfo } from "@/lib/types/geo";
import { useRepresentatives } from "@/hooks/use-representatives";
import { useTranslation } from "@/hooks/use-translation";

interface RepresentativesInfoProps {
	className?: string;
	userDistricts?: UserDistrictInfo | null;
}

function formatDistrictName(name: string | null): string {
	if (!name) return "Unknown District";
	const maxLength = 22;
	if (name.length <= maxLength) return name;
	return name.slice(0, maxLength - 3) + "...";
}

export function RepresentativesInfo({
	className,
	userDistricts,
}: RepresentativesInfoProps) {
	const { t } = useTranslation();
	const { districtInfo, loading, user } = useRepresentatives(
		userDistricts ?? null
	);
	const [isVancouverCouncilOpen, setIsVancouverCouncilOpen] = useState(false);

	if (loading) {
		return (
			<div className={cn("space-y-4 p-4", className)}>
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
				))}
			</div>
		);
	}

	if (!user) {
		return (
			<Card className={cn("m-4 border-dashed shadow-none", className)}>
				<CardContent className="text-center py-12 text-muted-foreground">
					<User className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
					<p className="text-sm font-medium text-foreground">
						{t.representatives.signInPrompt}
					</p>
					<p className="text-xs mt-1">
						{t.representatives.signInDesc}
					</p>
				</CardContent>
			</Card>
		);
	}

	const hasAnyDistrict =
		districtInfo.federal.name ||
		districtInfo.provincial.name ||
		districtInfo.municipalCity.name ||
		districtInfo.municipalDistrict.name ||
		districtInfo.municipalBorough.name;

	if (!hasAnyDistrict) {
		return (
			<Card className={cn("m-4 border-dashed shadow-none", className)}>
				<CardContent className="text-center py-12 text-muted-foreground">
					<MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
					<p className="text-sm font-medium text-foreground">
						{t.civicMap.locationNotSet}
					</p>
					<p className="text-xs mt-1">
						{t.representatives.locationPrompt}
					</p>
				</CardContent>
			</Card>
		);
	}

	const sections = [
		{
			key: "federal" as const,
			label: t.nav.federal,
			role: t.representatives.roles.mp,
			icon: Building2,
			districtName: districtInfo.federal.name,
			politician: districtInfo.federal.politician,
		},
		{
			key: "provincial" as const,
			label: t.nav.provincial,
			role:
				districtInfo.provincial.politician?.primary_role_en ||
				t.representatives.roles.mp, // Fallback if needed, though usually dynamic
			icon: Home,
			districtName: districtInfo.provincial.name,
			politician: districtInfo.provincial.politician,
		},
		...(districtInfo.municipalCity.politician
			? [
					{
						key: "municipalCity" as const,
						label: t.representatives.roles.city,
						role: t.representatives.roles.mayor,
						icon: MapPin,
						districtName: districtInfo.municipalCity.name,
						politician: districtInfo.municipalCity.politician,
					},
			  ]
			: []),
		{
			key: "municipalBorough" as const,
			label:
				districtInfo.municipalCity.name &&
				districtInfo.municipalCity.name.toLowerCase() === "montreal"
					? t.representatives.roles.borough
					: districtInfo.municipalBorough.politician?.primary_role_en?.includes(
							"Borough"
					  )
					? t.representatives.roles.borough
					: t.representatives.roles.city,
			role:
				districtInfo.municipalBorough.politician?.primary_role_en || t.representatives.roles.mayor,
			icon: MapPin,
			districtName: districtInfo.municipalBorough.name,
			politician: districtInfo.municipalBorough.politician,
		},
		{
			key: "municipalDistrict" as const,
			label: t.representatives.roles.boroughDistrict,
			role: t.representatives.roles.councillor,
			icon: MapPin,
			districtName: districtInfo.municipalDistrict.name,
			politician: districtInfo.municipalDistrict.politician,
		},
	];

	const isVancouver =
		districtInfo.municipalCity.name?.toLowerCase() === "vancouver";
	const visibleSections = sections.filter((section) => {
		if (isVancouver && section.key === "municipalDistrict") return false;
		if (section.key === "municipalBorough" && isVancouver) return false;
		if (!section.districtName && !section.politician) return false;
		return true;
	});

	return (
		<ScrollArea className={cn("h-full", className)}>
			<div className="p-4 space-y-2">
				<div className="px-1">
					<h2 className="text-lg font-semibold tracking-tight">
						{t.representatives.title}
					</h2>
				</div>

				<div className="grid gap-4">
					{visibleSections.map((section) => (
						<Card key={section.key} className="overflow-hidden py-0.5">
							<div className="h-8 px-3 bg-muted/30 border-b flex items-center justify-between gap-2">
								<div className="flex items-center gap-2 text-sm font-medium">
									<section.icon className="w-4 h-4 text-muted-foreground" />
									<span>{section.label}</span>
								</div>
								<Badge
									variant="outline"
									className="font-normal text-xs truncate max-w-[150px] bg-background/50"
								>
									{formatDistrictName(
										section.districtName || "Unknown District"
									)}
								</Badge>
							</div>
							<div className="px-3 pb-4">
								{section.politician ? (
									<div className="flex gap-3 items-center">
										{section.politician.photo_url ? (
											<div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border bg-muted">
												<Image
													src={section.politician.photo_url}
													alt={section.politician.name}
													fill
													className="object-cover"
												/>
											</div>
										) : (
											<div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center flex-shrink-0 border">
												<User className="w-7 h-7 text-muted-foreground" />
											</div>
										)}

										<div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
											<h3 className="font-semibold text-sm truncate leading-none">
												{section.politician.name}
											</h3>
											<p className="text-xs text-muted-foreground truncate">
												{section.politician.party || section.role}
											</p>

											{section.politician.email && (
												<div className="flex items-center pt-1">
													<Button
														variant="outline"
														size="sm"
														className="h-6 text-xs gap-1.5 px-2"
														asChild
													>
														<a href={`mailto:${section.politician.email}`}>
															<Mail className="w-3 h-3" />
															Email
														</a>
													</Button>
												</div>
											)}
										</div>
									</div>
								) : (
									<div className="text-sm text-muted-foreground italic py-1 text-center">
										{t.representatives.noRepFound}
									</div>
								)}
							</div>
						</Card>
					))}

					{isVancouver &&
						districtInfo.vancouverCouncil.councillors.length > 0 && (
							<Card className="overflow-hidden py-0.5">
								<div className="h-8 px-3 bg-muted/30 border-b flex items-center justify-between gap-2">
									<div className="flex items-center gap-2 text-sm font-medium">
										<MapPin className="w-4 h-4 text-muted-foreground" />
										<span>{t.representatives.cityCouncil}</span>
									</div>
									<Badge
										variant="outline"
										className="font-normal text-xs truncate max-w-[150px] bg-background/50"
									>
										{formatDistrictName(
											districtInfo.municipalCity.name || "Vancouver"
										)}
									</Badge>
								</div>
								<div className="px-3 pb-4">
									<Collapsible
										open={isVancouverCouncilOpen}
										onOpenChange={setIsVancouverCouncilOpen}
									>
										<CollapsibleTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												className="mt-2 h-7 w-full justify-between text-xs"
											>
												<span>
													{isVancouverCouncilOpen
														? t.representatives.hideCouncillors
														: `${t.representatives.showCouncillors} (${districtInfo.vancouverCouncil.councillors.length})`}
												</span>
												<ChevronDown
													className={cn(
														"h-4 w-4 text-muted-foreground transition-transform",
														isVancouverCouncilOpen ? "rotate-180" : "rotate-0"
													)}
												/>
											</Button>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<div className="pt-2">
												<ScrollArea className="max-h-64">
													<div className="space-y-2 pr-2">
														{districtInfo.vancouverCouncil.councillors.map(
															(p) => (
																<div
																	key={p.id}
																	className="flex items-center gap-2"
																>
																	{p.photo_url ? (
																		<div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border bg-muted">
																			<Image
																				src={p.photo_url}
																				alt={p.name}
																				fill
																				className="object-cover"
																			/>
																		</div>
																	) : (
																		<div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 border">
																			<User className="w-4 h-4 text-muted-foreground" />
																		</div>
																	)}

																	<div className="flex-1 min-w-0">
																		<p className="text-sm font-medium truncate">
																			{p.name}
																		</p>
																		{p.email && (
																			<Button
																				variant="outline"
																				size="sm"
																				className="mt-1 h-6 text-xs gap-1.5 px-2"
																				asChild
																			>
																				<a href={`mailto:${p.email}`}>
																					<Mail className="w-3 h-3" />
																					{t.common.email}
																				</a>
																			</Button>
																		)}
																	</div>
																</div>
															)
														)}
													</div>
												</ScrollArea>
											</div>
										</CollapsibleContent>
									</Collapsible>
								</div>
							</Card>
						)}
				</div>
			</div>
		</ScrollArea>
	);
}
