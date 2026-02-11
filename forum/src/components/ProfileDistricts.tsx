"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
	Building2,
	Home,
	MapPin,
	Mail,
	User,
	ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toSlug, getLevelRoutePrefix } from "@/lib/districts";
import { GovernmentLevel } from "@/lib/types/geo";

interface ProfileDistrictsProps {
	profileId: string;
	className?: string;
}

interface Politician {
	id: string;
	name: string;
	district: string;
	organization: string;
	primary_role_en: string;
	party: string | null;
	email: string | null;
	photo_url: string | null;
	salary?: number | null;
}

interface DistrictData {
	name: string | null;
	level: GovernmentLevel;
	politician: Politician | null;
	label: string;
	role: string;
}

export function ProfileDistricts({
	profileId,
	className,
}: ProfileDistrictsProps) {
	const [districts, setDistricts] = useState<DistrictData[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function fetchDistrictsAndPoliticians() {
			if (!profileId) {
				setLoading(false);
				return;
			}

			const supabase = createClient();

			// Get user's coordinates from profile
			const { data: profile } = await supabase
				.from("profiles")
				.select("coord")
				.eq("id", profileId)
				.single();

			if (!profile?.coord) {
				setLoading(false);
				return;
			}

			const { lat, lng } = profile.coord as { lat: number; lng: number };
			if (!lat || !lng) {
				setLoading(false);
				return;
			}

			// Fetch district names using RPC functions
			const [federalResult, provincialResult, municipalResult] =
				await Promise.all([
					supabase.rpc("find_federal_district", { lat, lng }),
					supabase.rpc("find_provincial_district", { lat, lng }),
					supabase.rpc("find_municipal_district", { lat, lng }),
				]);

			const federalName = federalResult.data || null;
			const provincialName = provincialResult.data || null;

			// Municipal result can be an object with borough and name
			let municipalName: string | null = null;
			let municipalBorough: string | null = null;
			if (municipalResult.data) {
				if (typeof municipalResult.data === "string") {
					municipalName = municipalResult.data;
				} else if (typeof municipalResult.data === "object") {
					municipalName = municipalResult.data.name || null;
					municipalBorough = municipalResult.data.borough || null;
				}
			}

			// Query politicians
			let federalPolitician: Politician | null = null;
			let provincialPolitician: Politician | null = null;
			let districtCouncillor: Politician | null = null;
			let boroughMayor: Politician | null = null;

			// Federal MP
			if (federalName) {
				const { data } = await supabase
					.from("politicians")
					.select(
						"id, name, district, organization, primary_role_en, party, email, photo_url, salary"
					)
					.ilike("organization", "%House of Commons%")
					.ilike("district", federalName)
					.limit(1);
				federalPolitician = data?.[0] || null;
			}

			// Provincial MNA/MPP
			if (provincialName) {
				let { data } = await supabase
					.from("politicians")
					.select(
						"id, name, district, organization, primary_role_en, party, email, photo_url, salary"
					)
					.ilike("organization", "%Assemblée nationale%")
					.ilike("district", provincialName.replace(/-/g, "%"))
					.limit(1);
				provincialPolitician = data?.[0] || null;

				if (!provincialPolitician) {
					const ontarioResult = await supabase
						.from("politicians")
						.select(
							"id, name, district, organization, primary_role_en, party, email, photo_url, salary"
						)
						.ilike("organization", "%Legislative Assembly of Ontario%")
						.ilike("district", provincialName.replace(/-/g, "%"))
						.limit(1);
					provincialPolitician = ontarioResult.data?.[0] || null;
				}
			}

			// City Councillor
			if (municipalName) {
				const { data } = await supabase
					.from("politicians")
					.select(
						"id, name, district, organization, primary_role_en, party, email, photo_url, salary"
					)
					.ilike("primary_role_en", "%councillor%")
					.ilike("district", municipalName)
					.limit(1);
				districtCouncillor = data?.[0] || null;
			}

			// Borough Mayor
			if (municipalBorough) {
				let { data } = await supabase
					.from("politicians")
					.select(
						"id, name, district, organization, primary_role_en, party, email, photo_url, salary"
					)
					.ilike("primary_role_en", "%borough mayor%")
					.ilike("district", municipalBorough.replace(/-/g, "%"))
					.limit(1);
				boroughMayor = data?.[0] || null;

				if (!boroughMayor) {
					const mayorResult = await supabase
						.from("politicians")
						.select(
							"id, name, district, organization, primary_role_en, party, email, photo_url, salary"
						)
						.ilike("primary_role_en", "%Mayor%")
						.not("primary_role_en", "ilike", "%borough%")
						.ilike("district", municipalBorough.replace(/-/g, "%"))
						.limit(1);
					boroughMayor = mayorResult.data?.[0] || null;
				}
			}

			const districtsList: DistrictData[] = [];

			if (federalName) {
				districtsList.push({
					name: federalName,
					level: "federal",
					politician: federalPolitician,
					label: "Federal Riding",
					role: "Member of Parliament",
				});
			}

			if (provincialName) {
				districtsList.push({
					name: provincialName,
					level: "provincial",
					politician: provincialPolitician,
					label: "Provincial Riding",
					role:
						provincialPolitician?.primary_role_en ||
						"Provincial Representative",
				});
			}

			if (municipalBorough) {
				districtsList.push({
					name: municipalBorough,
					level: "municipal",
					politician: boroughMayor,
					label: boroughMayor?.primary_role_en?.includes("Borough")
						? "Borough"
						: "City",
					role: boroughMayor?.primary_role_en || "Mayor",
				});
			}

			if (municipalName) {
				districtsList.push({
					name: municipalName,
					level: "municipal",
					politician: districtCouncillor,
					label: "Municipal Ward",
					role: "City Councillor",
				});
			}

			setDistricts(districtsList);
			setLoading(false);
		}

		fetchDistrictsAndPoliticians();
	}, [profileId]);

	if (loading) {
		return (
			<Card className={cn("", className)}>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 mt-2">
						<MapPin className="h-5 w-5" />
						My Electoral Districts and Elected Officials
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (districts.length === 0) {
		return (
			<Card className={cn("", className)}>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 mt-2">
						<MapPin className="h-5 w-5" />
						My Electoral Districts and Elected Officials
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-center py-8 text-muted-foreground">
						<MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
						<p className="text-sm font-medium">Location not set</p>
						<p className="text-xs mt-1">
							No district information available for this profile
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	const getLevelIcon = (level: GovernmentLevel) => {
		switch (level) {
			case "federal":
				return <Building2 className="w-5 h-5" />;
			case "provincial":
				return <Home className="w-5 h-5" />;
			case "municipal":
				return <MapPin className="w-5 h-5" />;
		}
	};

	const getLevelColor = (level: GovernmentLevel) => {
		switch (level) {
			case "federal":
				return "bg-blue-50 border-blue-200 text-blue-700";
			case "provincial":
				return "bg-emerald-50 border-emerald-200 text-emerald-700";
			case "municipal":
				return "bg-amber-50 border-amber-200 text-amber-700";
		}
	};

	return (
		<Card className={cn("", className)}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 mt-2">
					<MapPin className="h-5 w-5" />
					My Electoral Districts and Elected Officials
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 sm:grid-cols-2">
					{districts.map((district, idx) => (
						<div
							key={`${district.level}-${district.name}-${idx}`}
							className={cn(
								"rounded-lg border p-4 transition-colors",
								getLevelColor(district.level)
							)}
						>
							{/* District Header */}
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									{getLevelIcon(district.level)}
									<span className="text-xs font-semibold uppercase tracking-wide">
										{district.label}
									</span>
								</div>
								<Link
									href={`${getLevelRoutePrefix(district.level)}/${toSlug(
										district.name || ""
									)}`}
									className="text-xs hover:underline flex items-center gap-1"
								>
									View
									<ExternalLink className="w-3 h-3" />
								</Link>
							</div>

							{/* District Name */}
							<h3 className="font-semibold text-base mb-3 text-gray-900">
								{district.name}
							</h3>

							{/* Representative */}
							{district.politician ? (
								<div className="flex items-center gap-3 bg-white/60 rounded-md p-2 -mx-2">
									{district.politician.photo_url ? (
										<div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border bg-muted">
											<Image
												src={district.politician.photo_url}
												alt={district.politician.name}
												fill
												className="object-cover"
											/>
										</div>
									) : (
										<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 border">
											<User className="w-5 h-5 text-muted-foreground" />
										</div>
									)}
									<div className="flex-1 min-w-0">
										<p className="font-medium text-sm text-gray-900 truncate">
											{district.politician.name}
										</p>
										<p className="text-xs text-gray-600 truncate">
											{district.politician.party || district.role}
										</p>
										{district.politician.salary && (
											<p className="text-xs text-gray-600 font-medium">
												Salary: ${district.politician.salary.toLocaleString()}/year
											</p>
										)}
									</div>
									{district.politician.email && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 flex-shrink-0"
											asChild
										>
											<a href={`mailto:${district.politician.email}`}>
												<Mail className="w-4 h-4" />
											</a>
										</Button>
									)}
								</div>
							) : (
								<p className="text-xs text-gray-600 italic">
									No representative information available
								</p>
							)}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
