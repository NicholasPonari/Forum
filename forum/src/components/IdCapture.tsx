"use client";

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, SwitchCamera } from "lucide-react";

type IdType = "passport" | "drivers_license" | "medical_card";

type Props = {
	onCapture: (file: File) => void;
	onError?: (message: string) => void;
	idType?: IdType;
};

const ID_ASPECT_RATIOS: Record<
	IdType,
	{ width: number; height: number; label: string }
> = {
	passport: { width: 3, height: 4, label: "Passport" },
	drivers_license: { width: 1.586, height: 1, label: "Driver's License" }, // Standard ID card ratio
	medical_card: { width: 1.586, height: 1, label: "Medical Card" },
};

export default function IdCapture({
	onCapture,
	onError,
	idType = "drivers_license",
}: Props) {
	const videoRef = React.useRef<HTMLVideoElement | null>(null);
	const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
	const overlayRef = React.useRef<HTMLCanvasElement | null>(null);
	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const streamRef = React.useRef<MediaStream | null>(null);
	const rafRef = React.useRef<number | null>(null);

	const [ready, setReady] = React.useState(false);
	const [loading, setLoading] = React.useState(false);
	const [preview, setPreview] = React.useState<string | null>(null);
	const [facingMode, setFacingMode] = React.useState<"user" | "environment">(
		"environment",
	);
	const [msg, setMsg] = React.useState<string>("");

	const startCamera = async () => {
		try {
			setMsg("");
			setLoading(true);

			// Request camera with preferred facing mode
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode,
					width: { ideal: 1920 },
					height: { ideal: 1080 },
				},
				audio: false,
			});

			streamRef.current = stream;
			const video = videoRef.current;
			if (!video) {
				throw new Error("Video element not available");
			}

			video.srcObject = stream;
			video.playsInline = true;
			video.muted = true;
			video.autoplay = true;
			video.setAttribute("playsinline", "true");
			video.setAttribute("muted", "true");
			video.setAttribute("autoplay", "true");

			// Wait for video to be ready
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					if (video.videoWidth && video.videoHeight) {
						resolve();
					} else {
						reject(new Error("Video dimensions not available"));
					}
				}, 3000);

				const onReady = () => {
					if (video.videoWidth && video.videoHeight) {
						clearTimeout(timer);
						video.removeEventListener("loadedmetadata", onReady);
						video.removeEventListener("canplay", onReady);
						resolve();
					}
				};

				if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
					clearTimeout(timer);
					resolve();
				} else {
					video.addEventListener("loadedmetadata", onReady);
					video.addEventListener("canplay", onReady);
					video.play().catch(console.error);
				}
			});

			setReady(true);
			setLoading(false);
			startOverlayLoop();
		} catch (error) {
			console.error("[IdCapture] startCamera error:", error);
			const message = error instanceof Error ? error.message : "Camera error";
			if (onError) onError(message);
			setMsg("Unable to access camera: " + message);
			setLoading(false);
			stopCamera();
		}
	};

	const stopCamera = () => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((t) => t.stop());
		}
		streamRef.current = null;
		setReady(false);
	};

	const switchCamera = async () => {
		stopCamera();
		setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
	};

	// Restart camera when facing mode changes
	React.useEffect(() => {
		if (ready || loading) {
			// Camera was running, restart with new facing mode
			const restart = async () => {
				await startCamera();
			};
			restart();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [facingMode]);

	const reset = () => {
		setPreview(null);
		setMsg("");
		stopCamera();
	};

	const drawOverlay = () => {
		const overlay = overlayRef.current;
		const container = containerRef.current;
		if (!overlay || !container) return;

		// Use the container's displayed dimensions so the overlay
		// matches what the user actually sees (not the video's native res)
		const rect = container.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const w = Math.round(rect.width * dpr);
		const h = Math.round(rect.height * dpr);
		overlay.width = w;
		overlay.height = h;

		const ctx = overlay.getContext("2d");
		if (!ctx) return;

		ctx.clearRect(0, 0, w, h);

		// Get aspect ratio for current ID type
		const ratio = ID_ASPECT_RATIOS[idType];
		const isPortrait = ratio.height > ratio.width;

		// Calculate target rectangle size (80% of smallest dimension)
		let targetW: number;
		let targetH: number;

		if (isPortrait) {
			// Passport - portrait orientation
			targetH = h * 0.75;
			targetW = targetH * (ratio.width / ratio.height);
		} else {
			// Cards - landscape orientation: prioritize filling the vertical space
			targetH = h * 0.7;
			targetW = targetH * (ratio.width / ratio.height);

			// Clamp to 90% width if it overflows horizontally
			if (targetW > w * 0.9) {
				targetW = w * 0.9;
				targetH = targetW / (ratio.width / ratio.height);
			}
		}

		const targetX = (w - targetW) / 2;
		const targetY = (h - targetH) / 2;

		// Draw semi-transparent overlay outside the target area
		ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
		ctx.fillRect(0, 0, w, h);

		// Clear the target rectangle (make it transparent)
		ctx.clearRect(targetX, targetY, targetW, targetH);

		// Draw border around target area
		ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
		ctx.lineWidth = 3;
		ctx.strokeRect(targetX, targetY, targetW, targetH);

		// Draw corner markers
		const cornerLength = Math.min(targetW, targetH) * 0.1;
		ctx.strokeStyle = "#3b82f6";
		ctx.lineWidth = 5;
		ctx.lineCap = "round";

		// Top-left corner
		ctx.beginPath();
		ctx.moveTo(targetX, targetY + cornerLength);
		ctx.lineTo(targetX, targetY);
		ctx.lineTo(targetX + cornerLength, targetY);
		ctx.stroke();

		// Top-right corner
		ctx.beginPath();
		ctx.moveTo(targetX + targetW - cornerLength, targetY);
		ctx.lineTo(targetX + targetW, targetY);
		ctx.lineTo(targetX + targetW, targetY + cornerLength);
		ctx.stroke();

		// Bottom-left corner
		ctx.beginPath();
		ctx.moveTo(targetX, targetY + targetH - cornerLength);
		ctx.lineTo(targetX, targetY + targetH);
		ctx.lineTo(targetX + cornerLength, targetY + targetH);
		ctx.stroke();

		// Bottom-right corner
		ctx.beginPath();
		ctx.moveTo(targetX + targetW - cornerLength, targetY + targetH);
		ctx.lineTo(targetX + targetW, targetY + targetH);
		ctx.lineTo(targetX + targetW, targetY + targetH - cornerLength);
		ctx.stroke();

		// Draw label
		ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
		ctx.font = "16px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(
			`Align your ${ratio.label} within the frame`,
			w / 2,
			targetY - 20,
		);
	};

	const startOverlayLoop = () => {
		const tick = () => {
			drawOverlay();
			if (streamRef.current?.active) {
				rafRef.current = requestAnimationFrame(tick);
			}
		};
		rafRef.current = requestAnimationFrame(tick);
	};

	const capture = async () => {
		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;

		const w = video.videoWidth || 1920;
		const h = video.videoHeight || 1080;
		canvas.width = w;
		canvas.height = h;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Draw the video frame
		ctx.drawImage(video, 0, 0, w, h);

		const blob: Blob | null = await new Promise((resolve) => {
			if (canvas.toBlob) {
				canvas.toBlob(resolve, "image/jpeg", 0.95);
			} else {
				try {
					const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
					const arr = dataUrl.split(",");
					const bstr = atob(arr[1]);
					let n = bstr.length;
					const u8arr = new Uint8Array(n);
					while (n--) u8arr[n] = bstr.charCodeAt(n);
					resolve(new Blob([u8arr], { type: "image/jpeg" }));
				} catch {
					resolve(null);
				}
			}
		});

		if (!blob) {
			if (onError) onError("Failed to capture image");
			return;
		}

		const file = new File([blob], "id-photo.jpg", { type: "image/jpeg" });
		setPreview(URL.createObjectURL(blob));
		onCapture(file);
		stopCamera();
	};

	React.useEffect(() => {
		return () => {
			stopCamera();
		};
	}, []);

	return (
		<div className="w-full">
			{/* Camera view */}
			<div
				ref={containerRef}
				className="relative w-full rounded-lg overflow-hidden bg-gray-900 aspect-[4/3]"
				style={{ display: ready ? "block" : "none" }}
			>
				<video
					ref={videoRef}
					playsInline
					muted
					className="absolute inset-0 w-full h-full object-cover"
					style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
				/>
				<canvas
					ref={overlayRef}
					className="absolute inset-0 w-full h-full pointer-events-none"
					style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
				/>

				{/* Camera controls */}
				<div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4">
					<Button
						type="button"
						variant="secondary"
						size="icon"
						onClick={switchCamera}
						className="rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm"
						title="Switch camera"
					>
						<SwitchCamera className="w-5 h-5 text-white" />
					</Button>
					<Button
						type="button"
						onClick={capture}
						size="lg"
						className="rounded-full w-16 h-16 bg-white hover:bg-gray-100"
						title="Capture photo"
					>
						<Camera className="w-8 h-8 text-gray-900" />
					</Button>
					<div className="w-10" /> {/* Spacer for centering */}
				</div>
			</div>

			{/* Start camera button */}
			{!ready && !preview && (
				<div className="flex flex-col items-center gap-3">
					<div className="w-full aspect-[4/3] bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-4 border-2 border-dashed border-gray-300">
						<Camera className="w-12 h-12 text-gray-400" />
						<p className="text-sm text-gray-500 text-center px-4">
							Take a photo of your {ID_ASPECT_RATIOS[idType].label}
						</p>
						<Button onClick={startCamera} type="button" disabled={loading}>
							{loading ? "Starting Camera..." : "Open Camera"}
						</Button>
					</div>
					{msg && <div className="text-xs text-red-600 text-center">{msg}</div>}
				</div>
			)}

			<canvas ref={canvasRef} className="hidden" />

			{/* Preview */}
			{preview && (
				<div className="mt-3">
					<div className="relative w-full aspect-[4/3]">
						<Image
							src={preview}
							alt="ID preview"
							fill
							className="rounded-lg object-cover"
						/>
					</div>
					<div className="flex gap-2 mt-3">
						<Button
							type="button"
							variant="outline"
							onClick={reset}
							className="flex-1"
						>
							<RotateCcw className="w-4 h-4 mr-2" />
							Retake
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
