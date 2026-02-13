"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Loader2, Users, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

interface CommunityMember {
	lat: number;
	lng: number;
}

// Custom cluster icon that shows member count in dark circles (like the reference images)
function createClusterIcon(cluster: L.MarkerCluster) {
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

// Individual member marker (small dot)
const memberIcon = L.divIcon({
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

// Component to set initial bounds for Canada
function SetInitialView() {
	const map = useMap();

	useEffect(() => {
		// Center on Canada
		map.setView([56.1304, -106.3468], 4);
	}, [map]);

	return null;
}

export function CommunityMap() {
	const { t } = useTranslation();
	const [members, setMembers] = useState<CommunityMember[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [mapReady, setMapReady] = useState(false);

	useEffect(() => {
		async function fetchMembers() {
			try {
				const res = await fetch("/api/community-members");
				const data = await res.json();
				setMembers(data.members || []);
				setTotal(data.total || 0);
			} catch (err) {
				console.error("Failed to fetch community members:", err);
			} finally {
				setLoading(false);
			}
		}
		fetchMembers();
	}, []);

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="px-6 py-4 border-b bg-white">
				<div className="flex items-center gap-3 mb-2">
					<Users className="w-6 h-6 text-primary" />
					<h1 className="text-2xl font-bold">{t.community.title}</h1>
				</div>
				<p className="text-sm text-muted-foreground">{t.community.subtitle}</p>
				{!loading && (
					<div className="mt-2 flex items-center gap-2">
						<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold">
							<Users className="w-4 h-4" />
							{total.toLocaleString()} {t.community.membersTotal}
						</span>
					</div>
				)}
			</div>

			{/* Privacy Notice */}
			<div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100 text-blue-800">
				<ShieldCheck className="w-4 h-4 flex-shrink-0" />
				<p className="text-xs">{t.community.privacyNotice}</p>
			</div>

			{/* Map */}
			<div className="flex-1 relative">
				{loading && (
					<div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
						<div className="flex flex-col items-center gap-2">
							<Loader2 className="w-8 h-8 animate-spin text-primary" />
							<p className="text-sm text-muted-foreground">
								{t.community.loading}
							</p>
						</div>
					</div>
				)}
				<MapContainer
					center={[56.1304, -106.3468]}
					zoom={4}
					style={{ height: "100%", width: "100%" }}
					whenReady={() => setMapReady(true)}
				>
					<TileLayer
						url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
						attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					/>
					<SetInitialView />
					{mapReady && members.length > 0 && <ClusterLayer members={members} />}
				</MapContainer>
			</div>

			{/* Footer hint */}
			<div className="px-6 py-3 border-t bg-white text-center">
				<p className="text-xs text-muted-foreground">{t.community.zoomHint}</p>
			</div>
		</div>
	);
}

// Separate cluster layer component that uses useMap
function ClusterLayer({ members }: { members: CommunityMember[] }) {
	const map = useMap();

	useEffect(() => {
		if (members.length === 0) return;

		const markers = L.markerClusterGroup({
			iconCreateFunction: createClusterIcon,
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
				icon: memberIcon,
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
