"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import {
	X,
	MapPin,
	User,
	Eye,
	EyeOff,
	Layers,
	ShieldCheck,
} from "lucide-react";
import { Issue, VoteBreakdown } from "@/lib/types/db";
import {
	ProfileLocation,
	MapDistrictData,
	FederalDistrictGeo,
	ProvincialDistrictGeo,
	MunicipalDistrictGeo,
} from "@/lib/types/geo";
import {
	MapContainer,
	TileLayer,
	Marker,
	Popup,
	useMap,
	GeoJSON,
	Circle,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

interface MapDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	issues: Issue[];
	hoveredIssue: number | null;
	voteBreakdown: VoteBreakdown;
	onIssueHover: (issueId: number | null) => void;
	// New props for enhanced features
	profileLocation?: ProfileLocation | null;
	districts?: MapDistrictData | null;
}

interface CommunityMember {
	lat: number;
	lng: number;
}

// District layer visibility state
interface LayerVisibility {
	issues: boolean;
	profile: boolean;
	federal: boolean;
	provincial: boolean;
	municipal: boolean;
}

// District colors
const DISTRICT_COLORS = {
	federal: { stroke: "#1e40af", fill: "#3b82f6", name: "Federal Ridings" },
	provincial: {
		stroke: "#7c3aed",
		fill: "#8b5cf6",
		name: "Provincial Districts",
	},
	municipal: {
		stroke: "#059669",
		fill: "#10b981",
		name: "Municipal Districts",
	},
};

// Fix for Leaflet default markers in Next.js
if (typeof window !== "undefined") {
	delete (
		L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: () => void }
	)._getIconUrl;
	L.Icon.Default.mergeOptions({
		iconRetinaUrl:
			"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
		iconUrl:
			"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
		shadowUrl:
			"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
	});
}

// Component to fit map bounds to markers and profile
function FitBounds({
	issuePoints,
	profileLocation,
}: {
	issuePoints: [number, number][];
	profileLocation?: ProfileLocation | null;
}) {
	const map = useMap();

	useEffect(() => {
		const points: [number, number][] = [];

		// Add issue locations
		issuePoints.forEach((point) => {
			points.push(point);
		});

		// Add profile location
		if (profileLocation?.coord) {
			points.push([profileLocation.coord.lat, profileLocation.coord.lng]);
		}

		if (points.length > 0) {
			const bounds = L.latLngBounds(points);
			map.fitBounds(bounds, { padding: [50, 50] });
		}
	}, [map, issuePoints, profileLocation]);

	return null;
}

function getIssuePosition(issue: Issue): [number, number] | null {
	const issueAny = issue as unknown as {
		location_lat?: unknown;
		location_lng?: unknown;
		coord?: { lat?: unknown; lng?: unknown };
		location?: { lat?: unknown; lng?: unknown };
		geometry?: GeoJSON.Geometry;
		geom?: unknown;
		municipal_district?: { geom?: unknown } | unknown;
		district?: { geom?: unknown } | unknown;
	};

	function hexToBytes(hex: string): Uint8Array {
		const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
		const len = clean.length;
		const bytes = new Uint8Array(len / 2);
		for (let i = 0; i < len; i += 2) {
			bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
		}
		return bytes;
	}

	function getBoundsFromWkbHex(
		wkbHex: string,
	): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
		try {
			const bytes = hexToBytes(wkbHex);
			const view = new DataView(
				bytes.buffer,
				bytes.byteOffset,
				bytes.byteLength,
			);

			let minLng = Number.POSITIVE_INFINITY;
			let maxLng = Number.NEGATIVE_INFINITY;
			let minLat = Number.POSITIVE_INFINITY;
			let maxLat = Number.NEGATIVE_INFINITY;

			const update = (lng: number, lat: number) => {
				if (lng < minLng) minLng = lng;
				if (lng > maxLng) maxLng = lng;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			};

			const parseGeometry = (startOffset: number): number => {
				let offset = startOffset;
				const byteOrder = view.getUint8(offset);
				offset += 1;
				const littleEndian = byteOrder === 1;
				const type = view.getUint32(offset, littleEndian);
				offset += 4;

				const hasZ = (type & 0x80000000) !== 0;
				const hasM = (type & 0x40000000) !== 0;
				const hasSrid = (type & 0x20000000) !== 0;
				const baseType = type & 0x000000ff;

				const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

				if (hasSrid) {
					offset += 4;
				}

				const readPoint = () => {
					const x = view.getFloat64(offset, littleEndian);
					offset += 8;
					const y = view.getFloat64(offset, littleEndian);
					offset += 8;
					for (let i = 2; i < dims; i++) {
						offset += 8;
					}
					update(x, y);
				};

				if (baseType === 1) {
					readPoint();
					return offset;
				}

				if (baseType === 3) {
					const ringCount = view.getUint32(offset, littleEndian);
					offset += 4;
					for (let r = 0; r < ringCount; r++) {
						const pointCount = view.getUint32(offset, littleEndian);
						offset += 4;
						for (let p = 0; p < pointCount; p++) {
							readPoint();
						}
					}
					return offset;
				}

				if (baseType === 6) {
					const polygonCount = view.getUint32(offset, littleEndian);
					offset += 4;
					for (let i = 0; i < polygonCount; i++) {
						offset = parseGeometry(offset);
					}
					return offset;
				}

				return offset;
			};

			parseGeometry(0);

			if (
				!Number.isFinite(minLat) ||
				!Number.isFinite(maxLat) ||
				!Number.isFinite(minLng) ||
				!Number.isFinite(maxLng)
			) {
				return null;
			}

			return { minLat, maxLat, minLng, maxLng };
		} catch {
			return null;
		}
	}

	function getGeomHexFromIssue(): string | null {
		const directGeom = issueAny.geom;
		if (typeof directGeom === "string" && directGeom.length > 0)
			return directGeom;

		const municipalDistrict = issueAny.municipal_district as
			| { geom?: unknown }
			| undefined;
		const municipalGeom = municipalDistrict?.geom;
		if (typeof municipalGeom === "string" && municipalGeom.length > 0) {
			return municipalGeom;
		}

		const district = issueAny.district as { geom?: unknown } | undefined;
		const districtGeom = district?.geom;
		if (typeof districtGeom === "string" && districtGeom.length > 0) {
			return districtGeom;
		}

		return null;
	}

	if (
		issueAny.location_lat !== null &&
		issueAny.location_lat !== undefined &&
		issueAny.location_lng !== null &&
		issueAny.location_lng !== undefined
	) {
		const lat = Number(issueAny.location_lat);
		const lng = Number(issueAny.location_lng);
		if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
			return [lat, lng];
		}
	}

	if (
		issueAny.coord?.lat !== null &&
		issueAny.coord?.lat !== undefined &&
		issueAny.coord?.lng !== null &&
		issueAny.coord?.lng !== undefined
	) {
		const lat = Number(issueAny.coord.lat);
		const lng = Number(issueAny.coord.lng);
		if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
			return [lat, lng];
		}
	}

	if (
		issueAny.location?.lat !== null &&
		issueAny.location?.lat !== undefined &&
		issueAny.location?.lng !== null &&
		issueAny.location?.lng !== undefined
	) {
		const lat = Number(issueAny.location.lat);
		const lng = Number(issueAny.location.lng);
		if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
			return [lat, lng];
		}
	}

	if (issueAny.geometry) {
		try {
			const center = L.geoJSON(issueAny.geometry).getBounds().getCenter();
			if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
				return [center.lat, center.lng];
			}
		} catch {
			return null;
		}
	}

	const geomHex = getGeomHexFromIssue();
	if (geomHex) {
		const bounds = getBoundsFromWkbHex(geomHex);
		if (bounds) {
			const lat = (bounds.minLat + bounds.maxLat) / 2;
			const lng = (bounds.minLng + bounds.maxLng) / 2;
			if (Number.isFinite(lat) && Number.isFinite(lng)) {
				return [lat, lng];
			}
		}
	}

	return null;
}

// Custom marker icon for issues
const createIssueIcon = (isHovered: boolean) => {
	return L.divIcon({
		html: `
			<div class="relative">
				<div class="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center transform ${
					isHovered ? "scale-125" : "scale-100"
				} transition-transform duration-200">
					<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
					</svg>
				</div>
			</div>
		`,
		className: "custom-div-icon",
		iconSize: [24, 24],
		iconAnchor: [12, 24],
	});
};

// Custom marker icon for profile location (home/user)
const createProfileIcon = (avatarUrl?: string) => {
	return L.divIcon({
		html: `
			<div class="relative">
				<div class="w-10 h-10 bg-blue-600 rounded-full border-3 border-white shadow-xl flex items-center justify-center">
					${
						avatarUrl ?
							`<img src="${avatarUrl}" class="w-8 h-8 rounded-full object-cover" />`
						:	`<svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
					</svg>`
					}
				</div>
				<div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-l-transparent border-r-transparent border-t-blue-600"></div>
			</div>
		`,
		className: "custom-div-icon profile-marker",
		iconSize: [40, 48],
		iconAnchor: [20, 48],
	});
};

// Convert district to GeoJSON Feature
function districtToFeature(
	district: FederalDistrictGeo | ProvincialDistrictGeo | MunicipalDistrictGeo,
	level: "federal" | "provincial" | "municipal",
): GeoJSON.Feature | null {
	if (!district.geometry) return null;

	const name =
		"name_en" in district ? district.name_en
		: "name" in district ? district.name
		: "Unknown";

	return {
		type: "Feature",
		properties: {
			id: district.id,
			name,
			level,
			borough: "borough" in district ? district.borough : undefined,
		},
		geometry: district.geometry,
	};
}

// District GeoJSON Layer Component
function DistrictLayer({
	districts,
	level,
	visible,
}: {
	districts: (
		| FederalDistrictGeo
		| ProvincialDistrictGeo
		| MunicipalDistrictGeo
	)[];
	level: "federal" | "provincial" | "municipal";
	visible: boolean;
}) {
	console.log(`[DistrictLayer] ${level}:`, {
		visible,
		count: districts.length,
		districts,
	});
	if (!visible || districts.length === 0) return null;

	const colors = DISTRICT_COLORS[level];

	const features: GeoJSON.Feature[] = districts
		.map((d) => districtToFeature(d, level))
		.filter((f): f is GeoJSON.Feature => f !== null);

	console.log(`[DistrictLayer] ${level} features:`, features.length, features);
	if (features.length === 0) return null;

	const geoJsonData: GeoJSON.FeatureCollection = {
		type: "FeatureCollection",
		features,
	};

	return (
		<GeoJSON
			key={`${level}-${features.length}`}
			data={geoJsonData}
			style={() => ({
				color: colors.stroke,
				weight: 2,
				fillColor: colors.fill,
				fillOpacity: 0.15,
				opacity: 0.8,
			})}
			onEachFeature={(feature, layer) => {
				const name = feature.properties?.name || "Unknown District";
				const borough = feature.properties?.borough;
				layer.bindPopup(
					`<div class="p-2">
						<h4 class="font-semibold text-sm">${name}</h4>
						${borough ? `<p class="text-xs text-gray-600">${borough}</p>` : ""}
						<p class="text-xs text-gray-500 mt-1">${colors.name}</p>
					</div>`,
				);
			}}
		/>
	);
}

export function MapDrawer({
	isOpen,
	onClose,
	issues,
	hoveredIssue,
	voteBreakdown,
	onIssueHover,
	profileLocation,
	districts,
}: MapDrawerProps) {
	// Layer visibility state
	const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
		issues: true,
		profile: true,
		federal: true,
		provincial: true,
		municipal: true,
	});
	const [showLegend, setShowLegend] = useState(true);
	const [communityVisibility, setCommunityVisibility] = useState(false);
	const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>(
		[],
	);
	const [communityLoading, setCommunityLoading] = useState(false);

	useEffect(() => {
		if (!communityVisibility) {
			setCommunityMembers([]);
			return;
		}

		let isMounted = true;
		setCommunityLoading(true);

		async function fetchCommunityMembers() {
			try {
				const res = await fetch("/api/community-members");
				const data = await res.json();
				if (!isMounted) return;
				setCommunityMembers(data.members || []);
			} catch (err) {
				console.error("Failed to fetch community members:", err);
			} finally {
				if (isMounted) {
					setCommunityLoading(false);
				}
			}
		}

		fetchCommunityMembers();

		return () => {
			isMounted = false;
		};
	}, [communityVisibility]);

	// Toggle layer visibility
	const toggleLayer = useCallback(
		(layer: keyof LayerVisibility | "community") => {
			if (layer === "community") {
				setCommunityVisibility((prev) => !prev);
				return;
			}
			setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
		},
		[],
	);

	if (!isOpen) return null;

	const issuePositions = issues
		.map((issue) => {
			const position = getIssuePosition(issue);
			if (!position) return null;
			return { issue, position };
		})
		.filter(
			(item): item is { issue: Issue; position: [number, number] } =>
				item !== null,
		);

	const issuePoints = issuePositions.map((p) => p.position);

	// Calculate center point for initial map view (prefer profile location)
	let centerLat: number;
	let centerLng: number;

	if (profileLocation?.coord) {
		centerLat = profileLocation.coord.lat;
		centerLng = profileLocation.coord.lng;
	} else if (issuePositions.length > 0) {
		centerLat =
			issuePositions.reduce((sum, p) => sum + p.position[0], 0) /
			issuePositions.length;
		centerLng =
			issuePositions.reduce((sum, p) => sum + p.position[1], 0) /
			issuePositions.length;
	} else {
		// Default to Montreal
		centerLat = 45.5017;
		centerLng = -73.5673;
	}

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
				onClick={onClose}
			/>

			{/* Desktop: Side Drawer | Mobile: Bottom Sheet */}
			<div className="fixed md:inset-y-0 md:right-0 md:w-1/2 inset-x-0 bottom-0 h-[85vh] md:h-auto bg-white shadow-xl z-50 transform transition-transform duration-300 translate-x-0 rounded-t-2xl md:rounded-none">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-border">
					{/* Mobile: Drag Handle */}
					<div className="md:hidden absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gray-300 rounded-full" />
					<h2 className="text-lg font-medium">Issues Map</h2>
					<Button variant="ghost" size="sm" onClick={onClose}>
						<X className="w-4 h-4" />
					</Button>
				</div>

				{/* Privacy Notice */}
				{profileLocation?.coord && layerVisibility.profile && (
					<div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-blue-800">
						<ShieldCheck className="w-4 h-4 flex-shrink-0" />
						<p className="text-xs">
							Showing a ~200 m range around your approximate location. Your
							exact location is <strong>private</strong> and visible{" "}
							<strong>only by you</strong>.
						</p>
					</div>
				)}

				{/* Map Container */}
				<div
					className={`relative ${profileLocation?.coord && layerVisibility.profile ? "h-[calc(100vh-120px)]" : "h-[calc(100vh-80px)]"} bg-slate-100`}
				>
					<MapContainer
						center={[centerLat, centerLng]}
						zoom={15}
						style={{ height: "100%", width: "100%" }}
						className="rounded-lg"
					>
						<TileLayer
							url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
						/>
						<FitBounds
							issuePoints={issuePoints}
							profileLocation={profileLocation}
						/>

						{/* District Boundary Layers (render in order: federal > provincial > municipal) */}
						{districts?.federal && (
							<DistrictLayer
								districts={districts.federal}
								level="federal"
								visible={layerVisibility.federal}
							/>
						)}
						{districts?.provincial && (
							<DistrictLayer
								districts={districts.provincial}
								level="provincial"
								visible={layerVisibility.provincial}
							/>
						)}
						{districts?.municipal && (
							<DistrictLayer
								districts={districts.municipal}
								level="municipal"
								visible={layerVisibility.municipal}
							/>
						)}

						{/* Profile Location - Radius Circle (privacy-friendly) */}
						{profileLocation?.coord && layerVisibility.profile && (
							<Circle
								center={[profileLocation.coord.lat, profileLocation.coord.lng]}
								radius={200}
								pathOptions={{
									color: "#2563eb",
									fillColor: "#3b82f6",
									fillOpacity: 0.12,
									weight: 2,
									dashArray: "6 4",
								}}
							>
								<Popup>
									<div className="p-2 min-w-[180px]">
										<div className="flex items-center gap-2 mb-1">
											<User className="w-4 h-4 text-blue-600" />
											<h4 className="font-semibold text-sm">
												{profileLocation.username || "Your Location"}
											</h4>
										</div>
										<p className="text-xs text-gray-500">
											~200 m approximate area
										</p>
									</div>
								</Popup>
							</Circle>
						)}

						{/* Issue Markers */}
						{layerVisibility.issues &&
							issuePositions.map(({ issue, position }) => {
								const isHovered = hoveredIssue === issue.id;
								const votes = voteBreakdown[issue.id] || {
									upvotes: 0,
									downvotes: 0,
								};

								return (
									<Marker
										key={issue.id}
										position={position}
										icon={createIssueIcon(isHovered)}
										eventHandlers={{
											mouseover: () => onIssueHover(issue.id),
											mouseout: () => onIssueHover(null),
										}}
									>
										<Popup>
											<Link href={`/${issue.id}`}>
												<div className="p-2 min-w-[200px]">
													<h4 className="font-semibold text-sm mb-1">
														{issue.title}
													</h4>
													<p className="text-xs text-gray-600 mb-2 line-clamp-2">
														{issue.narrative}
													</p>
													<div className="flex items-center gap-2 text-xs">
														<span className="text-green-600 flex items-center gap-1">
															↑ {votes.upvotes}
														</span>
														<span className="text-red-600 flex items-center gap-1">
															↓ {votes.downvotes}
														</span>
													</div>
												</div>
											</Link>
										</Popup>
									</Marker>
								);
							})}

						{/* Community Members */}
						{communityVisibility && communityMembers.length > 0 && (
							<CommunityClusterLayer members={communityMembers} />
						)}
					</MapContainer>

					{communityVisibility && communityLoading && (
						<div className="absolute inset-0 pointer-events-none flex items-start justify-center mt-6">
							<div className="bg-white/90 px-3 py-1.5 rounded-full text-xs text-muted-foreground shadow">
								Loading community members…
							</div>
						</div>
					)}

					{/* Enhanced Map Legend */}
					{showLegend && (
						<div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-[220px] max-h-[50vh] overflow-y-auto z-[1000]">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-sm font-semibold">Map Legend</h3>
								<Button
									variant="ghost"
									size="sm"
									className="w-6 h-6 p-0"
									onClick={() => setShowLegend(false)}
								>
									<X className="w-3 h-3" />
								</Button>
							</div>

							{/* Markers Section */}
							<div className="space-y-2 mb-3">
								<p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
									Markers
								</p>

								{/* Profile Location */}
								{profileLocation && (
									<button
										onClick={() => toggleLayer("profile")}
										className={`flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-50 transition-colors ${
											!layerVisibility.profile ? "opacity-50" : ""
										}`}
									>
										<div
											className="w-5 h-5 rounded-full border-2"
											style={{
												borderColor: "#2563eb",
												backgroundColor: "#3b82f620",
												borderStyle: "dashed",
											}}
										/>
										<span className="text-xs flex-1">
											Your Location (~200m radius)
										</span>
										{layerVisibility.profile ?
											<Eye className="w-3 h-3 text-gray-400" />
										:	<EyeOff className="w-3 h-3 text-gray-400" />}
									</button>
								)}

								{/* Issues */}
								<button
									onClick={() => toggleLayer("issues")}
									className={`flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-50 transition-colors ${
										!layerVisibility.issues ? "opacity-50" : ""
									}`}
								>
									<MapPin
										className="w-5 h-5 text-red-500"
										fill="currentColor"
									/>
									<span className="text-xs flex-1">
										Issues ({issuePositions.length})
									</span>
									{layerVisibility.issues ?
										<Eye className="w-3 h-3 text-gray-400" />
									:	<EyeOff className="w-3 h-3 text-gray-400" />}
								</button>

								{/* Community Members */}
								<button
									onClick={() => toggleLayer("community")}
									className={`flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-50 transition-colors ${
										communityVisibility ? "" : "opacity-50"
									}`}
								>
									<div
										className="w-5 h-5 rounded-full border-2"
										style={{
											borderColor: "#111827",
											backgroundColor: "#11182720",
										}}
									/>
									<span className="text-xs flex-1">Community Members</span>
									{communityVisibility ?
										<Eye className="w-3 h-3 text-gray-400" />
									:	<EyeOff className="w-3 h-3 text-gray-400" />}
								</button>
							</div>

							{/* District Boundaries Section */}
							{districts && (
								<div className="space-y-2 pt-2 border-t border-gray-100">
									<p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
										District Boundaries
									</p>

									{/* Federal Districts */}
									{districts.federal && districts.federal.length > 0 && (
										<button
											onClick={() => toggleLayer("federal")}
											className={`flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-50 transition-colors ${
												!layerVisibility.federal ? "opacity-50" : ""
											}`}
										>
											<div
												className="w-5 h-3 rounded border-2"
												style={{
													borderColor: DISTRICT_COLORS.federal.stroke,
													backgroundColor: `${DISTRICT_COLORS.federal.fill}30`,
												}}
											/>
											<span className="text-xs flex-1">
												Federal ({districts.federal.length})
											</span>
											{layerVisibility.federal ?
												<Eye className="w-3 h-3 text-gray-400" />
											:	<EyeOff className="w-3 h-3 text-gray-400" />}
										</button>
									)}

									{/* Provincial Districts */}
									{districts.provincial && districts.provincial.length > 0 && (
										<button
											onClick={() => toggleLayer("provincial")}
											className={`flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-50 transition-colors ${
												!layerVisibility.provincial ? "opacity-50" : ""
											}`}
										>
											<div
												className="w-5 h-3 rounded border-2"
												style={{
													borderColor: DISTRICT_COLORS.provincial.stroke,
													backgroundColor: `${DISTRICT_COLORS.provincial.fill}30`,
												}}
											/>
											<span className="text-xs flex-1">
												Provincial ({districts.provincial.length})
											</span>
											{layerVisibility.provincial ?
												<Eye className="w-3 h-3 text-gray-400" />
											:	<EyeOff className="w-3 h-3 text-gray-400" />}
										</button>
									)}

									{/* Municipal Districts */}
									{districts.municipal && districts.municipal.length > 0 && (
										<button
											onClick={() => toggleLayer("municipal")}
											className={`flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-gray-50 transition-colors ${
												!layerVisibility.municipal ? "opacity-50" : ""
											}`}
										>
											<div
												className="w-5 h-3 rounded border-2"
												style={{
													borderColor: DISTRICT_COLORS.municipal.stroke,
													backgroundColor: `${DISTRICT_COLORS.municipal.fill}30`,
												}}
											/>
											<span className="text-xs flex-1">
												Municipal ({districts.municipal.length})
											</span>
											{layerVisibility.municipal ?
												<Eye className="w-3 h-3 text-gray-400" />
											:	<EyeOff className="w-3 h-3 text-gray-400" />}
										</button>
									)}
								</div>
							)}

							<p className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100">
								Click layers to toggle visibility
							</p>
						</div>
					)}

					{/* Legend Toggle (when closed) */}
					{!showLegend && (
						<Button
							variant="outline"
							size="sm"
							className="absolute bottom-4 left-4 bg-white shadow-md z-[1000]"
							onClick={() => setShowLegend(true)}
						>
							<Layers className="w-4 h-4 mr-1" />
							Legend
						</Button>
					)}
				</div>
			</div>
		</>
	);
}

const communityMemberIcon = L.divIcon({
	html: `<div style="
		background: #1a1a1a;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0,0,0,0.3);
	"></div>`,
	className: "community-member-icon",
	iconSize: L.point(10, 10),
	iconAnchor: L.point(5, 5),
});

function createCommunityClusterIcon(cluster: L.MarkerCluster) {
	const count = cluster.getChildCount();
	let size = 40;
	let fontSize = "14px";

	if (count >= 1000) {
		size = 60;
		fontSize = "16px";
	} else if (count >= 100) {
		size = 52;
		fontSize = "15px";
	} else if (count >= 10) {
		size = 44;
		fontSize = "14px";
	}

	const displayCount =
		count >= 1000 ? `${Math.round(count / 1000)}k` : count.toString();

	return L.divIcon({
		html: `<div style="
			background: #1a1a1a;
			color: white;
			border-radius: 50%;
			width: ${size}px;
			height: ${size}px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: ${fontSize};
			font-weight: 700;
			box-shadow: 0 4px 12px rgba(0,0,0,0.3);
			border: 3px solid rgba(255,255,255,0.9);
		">${displayCount}</div>`,
		className: "community-cluster-icon",
		iconSize: L.point(size, size),
	});
}

function CommunityClusterLayer({ members }: { members: CommunityMember[] }) {
	const map = useMap();

	useEffect(() => {
		if (members.length === 0) return;

		const markers = L.markerClusterGroup({
			iconCreateFunction: createCommunityClusterIcon,
			maxClusterRadius: 80,
			spiderfyOnMaxZoom: false,
			showCoverageOnHover: false,
			zoomToBoundsOnClick: true,
			disableClusteringAtZoom: 16,
			chunkedLoading: true,
			animate: true,
		});

		members.forEach((member) => {
			const marker = L.marker([member.lat, member.lng], {
				icon: communityMemberIcon,
			});
			markers.addLayer(marker);
		});

		map.addLayer(markers);

		return () => {
			map.removeLayer(markers);
		};
	}, [map, members]);

	return null;
}
