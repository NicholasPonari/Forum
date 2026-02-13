"use client";

import { useEffect } from "react";

export function PerfDebug() {
	useEffect(() => {
		if (process.env.NEXT_PUBLIC_PERF_DEBUG !== "1") return;

		const navStart = performance.timeOrigin;
		const sinceStart = () => Math.round(performance.now());

		console.log(`[PerfDebug] mounted at +${sinceStart()}ms`);

		const reportNav = () => {
			const navEntries = performance.getEntriesByType(
				"navigation",
			) as PerformanceNavigationTiming[];
			const nav = navEntries[0];
			if (!nav) return;

			console.log("[PerfDebug] navigation timing", {
				ttfb: Math.round(nav.responseStart),
				domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
				load: Math.round(nav.loadEventEnd),
				transferSize: nav.transferSize,
				navType: nav.type,
				startTimeEpochMs: Math.round(navStart),
			});
		};

		if (document.readyState === "complete") {
			reportNav();
		} else {
			window.addEventListener("load", reportNav, { once: true });
		}

		let po: PerformanceObserver | undefined;
		try {
			po = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					// Long Task API: entryType === 'longtask'
					const anyEntry = entry as unknown as {
						name?: string;
						duration?: number;
						startTime?: number;
					};
					const duration = Math.round(anyEntry.duration ?? 0);
					const startTime = Math.round(anyEntry.startTime ?? 0);
					console.warn("[PerfDebug] longtask", {
						startTimeMs: startTime,
						durationMs: duration,
					});
				}
			});
			po.observe({ type: "longtask", buffered: true } as never);
		} catch {
			// ignore
		}

		return () => {
			po?.disconnect();
		};
	}, []);

	return null;
}
