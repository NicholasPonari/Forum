"use client";

import { useEffect, useState, useRef } from "react";
import { useScroll, useTransform, MotionValue } from "framer-motion";

export interface LogoTransitionResult {
	startLogoRef: React.RefObject<HTMLDivElement | null>;
	isReady: boolean;
	motionStyle: {
		x: MotionValue<number>;
		y: MotionValue<number>;
		scale: MotionValue<number>;
		opacity: MotionValue<number>;
		position: "fixed";
		top: number;
		left: number;
		originX: number;
		originY: number;
		zIndex: number;
	} | undefined;
}

export function useLogoTransition(
	headerLogoRef: React.RefObject<HTMLDivElement | null> | undefined
): LogoTransitionResult {
	const startLogoRef = useRef<HTMLDivElement>(null);
	const [rects, setRects] = useState<{
		start: { top: number; left: number; width: number } | null;
		end: { top: number; left: number; width: number } | null;
	}>({ start: null, end: null });

	useEffect(() => {
		const measure = () => {
			if (startLogoRef.current && headerLogoRef?.current) {
				const startRect = startLogoRef.current.getBoundingClientRect();
				const endRect = headerLogoRef.current.getBoundingClientRect();
				const scrollY = window.scrollY;

				setRects({
					start: {
						top: startRect.top + scrollY,
						left: startRect.left,
						width: startRect.width,
					},
					end: {
						top: endRect.top, // Header is sticky, so top is constant in viewport
						left: endRect.left,
						width: endRect.width,
					},
				});
			}
		};

		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [headerLogoRef]);

	const { scrollY } = useScroll();

	// IMPORTANT: hooks must be called unconditionally. Use fallback rects until measured.
	const startRect = rects.start ?? { top: 0, left: 0, width: 150 };
	const endRect = rects.end ?? { top: 0, left: 0, width: 80 };

	// Map scroll range [0, 150] to position/scale
	const range = [0, 150];

	// We set 'top' and 'left' to 0 in styles, and control everything via x/y transform
	const x = useTransform(scrollY, range, [startRect.left, endRect.left]);
	const y = useTransform(scrollY, range, [startRect.top, endRect.top]);
	const scale = useTransform(scrollY, range, [1, endRect.width / startRect.width]);
	const opacity = useTransform(scrollY, [0, 100, 150], [1, 0.5, 0]);

	const isReady = Boolean(rects.start && rects.end);

	return {
		startLogoRef,
		isReady,
		motionStyle: isReady
			? {
					position: "fixed",
					top: 0,
					left: 0,
					zIndex: 10,
					originX: 0,
					originY: 0,
					x,
					y,
					scale,
					opacity,
			  }
			: undefined,
	};
}
