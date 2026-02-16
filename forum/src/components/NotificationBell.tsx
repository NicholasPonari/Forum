"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "./ui/button";
import { NotificationPanel } from "./NotificationPanel";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabaseClient";

export function NotificationBell() {
	const { user } = useAuth();
	const [unreadCount, setUnreadCount] = useState(0);
	const [isOpen, setIsOpen] = useState(false);
	const [isMobile, setIsMobile] = useState(false);

	// Detect mobile
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth < 768);
		};
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	// Poll for unread count
	useEffect(() => {
		if (!user) {
			setUnreadCount(0);
			return;
		}

		const supabase = createClient();

		const fetchUnreadCount = async () => {
			// Only fetch if document is visible and panel is closed
			if (document.visibilityState !== "visible" || isOpen) return;

			try {
				const { count, error } = await supabase
					.from("notifications")
					.select("id", { count: "exact", head: true })
					.eq("is_read", false)
					.eq("user_id", user.id);

				if (error) {
					console.error("Error fetching unread count:", error);
					return;
				}

				setUnreadCount(count || 0);
			} catch (error) {
				console.error("Error fetching unread count:", error);
			}
		};

		// Initial fetch
		fetchUnreadCount();

		// Poll every 3 minutes
		const interval = setInterval(fetchUnreadCount, 3 * 60 * 1000);

		// Fetch when page becomes visible
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				fetchUnreadCount();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [user, isOpen]);

	// Refetch count when panel closes
	useEffect(() => {
		if (!isOpen && user) {
			const supabase = createClient();
			const fetchCount = async () => {
				try {
					const { count, error } = await supabase
						.from("notifications")
						.select("id", { count: "exact", head: true })
						.eq("is_read", false)
						.eq("user_id", user.id);

					if (error) {
						console.error("Error fetching unread count:", error);
						return;
					}

					setUnreadCount(count || 0);
				} catch (error) {
					console.error("Error fetching unread count:", error);
				}
			};
			fetchCount();
		}
	}, [isOpen, user]);

	if (!user) return null;

	const bellButton = (
		<Button
			variant="ghost"
			size="sm"
			className="relative p-2 hover:bg-gray-100 rounded-full"
			onClick={isMobile ? () => setIsOpen(!isOpen) : undefined}
		>
			<Image
				src="/Notifications.png"
				alt="Notification Bell"
				width={28}
				height={28}
			/>
			{unreadCount > 0 && (
				<span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
					{unreadCount > 9 ? "9+" : unreadCount}
				</span>
			)}
		</Button>
	);

	return (
		<NotificationPanel
			isOpen={isOpen}
			onClose={() => setIsOpen(false)}
			onOpenChange={setIsOpen}
			trigger={bellButton}
			isMobile={isMobile}
		/>
	);
}
