"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
const MapPicker = dynamic(() => import("@/components/MapPicker"), {
	ssr: false,
});
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { findDistricts } from "@/lib/utils/geolocation";
import { getExternalVideoEmbedInfo } from "@/lib/externalVideo";
import { cn } from "@/lib/utils";
import { TOPIC_IDS, TOPICS } from "@/lib/topics";
import {
	MapPin,
	Image as ImageIcon,
	Link2,
	Video as VideoIcon,
	X,
	Loader2,
	Building2,
	Home,
	Landmark,
} from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

const issueSchema = z
	.object({
		type: z.enum(["Idea", "Problem", "Question"], {
			invalid_type_error: "Type is required",
			required_error: "Type is required",
		}),
		topic: z.enum(TOPIC_IDS as [string, ...string[]], {
			invalid_type_error: "Topic is required",
			required_error: "Topic is required",
		}),
		province: z.string().optional().nullable(),
		city: z.string().optional().nullable(),
		governmentLevel: z
			.enum(["federal", "provincial", "municipal"])
			.optional()
			.nullable(),
		title: z.string().min(3, "Title is required"),
		narrative: z.string().min(3, "Narrative is required"),
		mediaType: z.enum(["photo", "video", "external_video"]).optional(),
		image: z.any().optional(),
		video: z.any().optional(),
		externalVideoUrl: z.string().trim().optional(),
		location: z
			.object({
				lat: z.number(),
				lng: z.number(),
			})
			.optional()
			.nullable(),
	})
	.refine(
		(data) => {
			// If mediaType is selected, ensure corresponding media is provided
			if (
				data.mediaType === "photo" &&
				(!data.image || data.image.length === 0)
			) {
				return false;
			}
			if (
				data.mediaType === "video" &&
				(!data.video || data.video.length === 0)
			) {
				return false;
			}
			if (data.mediaType === "external_video") {
				if (!data.externalVideoUrl) {
					return false;
				}

				if (!getExternalVideoEmbedInfo(data.externalVideoUrl)) {
					return false;
				}
			}
			// Ensure only one media type is selected
			if (data.mediaType === "photo" && data.video && data.video.length > 0) {
				return false;
			}
			if (data.mediaType === "video" && data.image && data.image.length > 0) {
				return false;
			}
			if (
				data.mediaType === "external_video" &&
				((data.image && data.image.length > 0) ||
					(data.video && data.video.length > 0))
			) {
				return false;
			}
			return true;
		},
		{
			message:
				"Please select a media type and provide the corresponding media (YouTube or Instagram URL for external video)",
			path: ["mediaType"],
		},
	);

type IssueFormValues = z.infer<typeof issueSchema>;

const TOPIC_OPTIONS = TOPIC_IDS.map((id) => ({
	value: id,
	label: TOPICS[id].label,
}));

const PROVINCES = [
	"Alberta",
	"British Columbia",
	"Manitoba",
	"New Brunswick",
	"Newfoundland and Labrador",
	"Northwest Territories",
	"Nova Scotia",
	"Nunavut",
	"Ontario",
	"Prince Edward Island",
	"Quebec",
	"Saskatchewan",
	"Yukon",
] as const;

export function IssueForm({
	onSubmitted,
	modalOpen,
}: {
	onSubmitted?: () => void;
	modalOpen?: boolean;
}) {
	const { user, loading, isMember } = useAuth();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [uploadProgress, setUploadProgress] = useState<number>(0);
	const [isMapOpen, setIsMapOpen] = useState(false);

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<IssueFormValues>({
		resolver: zodResolver(issueSchema),
		defaultValues: {
			topic: "general",
			province: null,
			city: null,
			governmentLevel: null,
		},
	});

	const location = watch("location");
	const type = watch("type");
	const topic = watch("topic");
	const governmentLevel = watch("governmentLevel");
	const province = watch("province");
	const city = watch("city");
	const mediaType = watch("mediaType");
	const image = watch("image");
	const video = watch("video");
	const externalVideoUrl = watch("externalVideoUrl");
	const externalVideoPreview = getExternalVideoEmbedInfo(externalVideoUrl);

	const [availableCities, setAvailableCities] = useState<string[]>([]);
	const [loadingPlaceDefaults, setLoadingPlaceDefaults] = useState(false);

	useEffect(() => {
		async function loadDefaultsFromProfile() {
			if (!user?.id) return;

			setLoadingPlaceDefaults(true);
			try {
				const supabase = createClient();
				const { data: profile } = await supabase
					.from("profiles")
					.select("coord")
					.eq("id", user.id)
					.single();

				if (!profile?.coord) return;

				const coord =
					typeof profile.coord === "string" ?
						JSON.parse(profile.coord)
					:	profile.coord;
				if (!coord?.lat || !coord?.lng) return;

				const [provincialResult, municipalResult] = await Promise.all([
					supabase.rpc("find_provincial_district", {
						lat: coord.lat,
						lng: coord.lng,
					}),
					supabase.rpc("find_municipal_district", {
						lat: coord.lat,
						lng: coord.lng,
					}),
				]);

				const provincialDistrict =
					(provincialResult.data as string | null) ?? null;
				const municipalData = municipalResult.data as
					| string
					| { borough?: string | null; name?: string | null }
					| null;

				let municipalDistrict: string | null = null;
				if (typeof municipalData === "string")
					municipalDistrict = municipalData;
				if (municipalData && typeof municipalData === "object") {
					municipalDistrict = municipalData.name || null;
				}

				if (!province && provincialDistrict) {
					const { data: provincialMeta } = await supabase
						.from("provincial_districts")
						.select("province")
						.eq("name", provincialDistrict)
						.maybeSingle();
					if (provincialMeta?.province) {
						setValue("province", provincialMeta.province, {
							shouldValidate: true,
						});
					}
				}

				if (!city && municipalDistrict) {
					const { data: municipalMeta } = await supabase
						.from("municipal_districts")
						.select("city")
						.eq("name", municipalDistrict)
						.maybeSingle();
					if (municipalMeta?.city) {
						setValue("city", municipalMeta.city, {
							shouldValidate: true,
						});
					}
				}
			} catch (e) {
				console.error("Error loading profile place defaults:", e);
			} finally {
				setLoadingPlaceDefaults(false);
			}
		}

		loadDefaultsFromProfile();
	}, [city, province, setValue, user?.id]);

	useEffect(() => {
		async function loadCities() {
			const supabase = createClient();
			const { data } = await supabase
				.from("municipal_districts")
				.select("city")
				.not("city", "is", null)
				.limit(2000);

			const uniqueCities = Array.from(
				new Set((data || []).map((d) => d.city).filter(Boolean)),
			).sort() as string[];
			setAvailableCities(uniqueCities);
		}

		loadCities();
	}, []);

	// Automatically open map if location is selected initially (e.g. edit mode - future proofing)
	useEffect(() => {
		if (location && !isMapOpen) {
			// Optionally open map, but maybe better to keep closed to avoid clutter
		}
	}, []);

	const uploadToMux = async (file: File): Promise<string> => {
		try {
			setUploadProgress(10);

			// Create Mux upload URL
			const response = await fetch("/api/mux/upload", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					filename: file.name,
					contentType: file.type,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				console.error("Upload URL creation failed:", errorData);
				throw new Error(
					"Failed to get upload URL: " + (errorData.error || "Unknown error"),
				);
			}

			const { uploadUrl, uploadId } = await response.json();
			console.log("Got upload URL and ID:", { uploadUrl, uploadId });
			setUploadProgress(30);

			// Upload file to Mux
			const uploadResponse = await fetch(uploadUrl, {
				method: "PUT",
				body: file,
				headers: {
					"Content-Type": file.type,
				},
			});

			if (!uploadResponse.ok) {
				console.error(
					"File upload to Mux failed:",
					uploadResponse.status,
					uploadResponse.statusText,
				);
				throw new Error("Failed to upload video to Mux");
			}
			setUploadProgress(60);

			// Wait for upload to be processed and asset to be created
			let attempts = 0;
			while (attempts < 60) {
				// Max 60 attempts (10 minutes)
				const statusResponse = await fetch(`/api/mux/upload/${uploadId}`);
				if (statusResponse.ok) {
					const uploadStatus = await statusResponse.json();
					console.log("Upload status:", uploadStatus);

					if (
						uploadStatus.status === "asset_created" &&
						uploadStatus.asset_status === "ready" &&
						uploadStatus.playback_ids &&
						uploadStatus.playback_ids.length > 0
					) {
						setUploadProgress(100);
						return uploadStatus.playback_ids[0].id;
					}

					// Update progress based on status
					if (uploadStatus.status === "asset_created") {
						setUploadProgress(80);
					} else if (uploadStatus.status === "waiting") {
						setUploadProgress(70);
					}
				} else {
					console.error(
						"Failed to check upload status:",
						statusResponse.status,
					);
				}
				attempts++;
				await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
			}

			throw new Error("Video processing timed out - please try again");
		} catch (error) {
			console.error("Mux upload error:", error);
			throw error;
		}
	};

	const onSubmit = async (values: IssueFormValues) => {
		if (!user) {
			setError("You must be logged in to submit an issue.");
			return;
		}
		setSubmitting(true);
		setError(null);
		setUploadProgress(0);
		const supabase = createClient();
		const {
			data: { user: authenticatedUser },
			error: authUserError,
		} = await supabase.auth.getUser();

		if (authUserError || !authenticatedUser) {
			setError("Your session expired. Please log in again.");
			setSubmitting(false);
			return;
		}

		if (authenticatedUser.id !== user.id) {
			console.warn("IssueForm user/session mismatch detected", {
				authContextUserId: user.id,
				authenticatedUserId: authenticatedUser.id,
			});
		}

		const authorUserId = authenticatedUser.id;
		let image_url = null;
		let video_url = null;
		let external_video_url = null;

		// Handle image upload if present
		if (
			values.mediaType === "photo" &&
			values.image &&
			values.image.length > 0
		) {
			const file = values.image[0];
			console.log(
				"Uploading image:",
				file,
				file instanceof File,
				file.type,
				file.size,
			);
			const filePath = `issues/${Date.now()}-${file.name}`;
			const { error: uploadError } = await supabase.storage
				.from("images")
				.upload(filePath, file, { contentType: file.type });
			if (uploadError) {
				console.error("Supabase upload error:", uploadError);
				setError("Image upload failed: " + uploadError.message);
				setSubmitting(false);
				return;
			}
			image_url = supabase.storage.from("images").getPublicUrl(filePath)
				.data.publicUrl;
		}

		// Handle video upload if present
		if (
			values.mediaType === "video" &&
			values.video &&
			values.video.length > 0
		) {
			const file = values.video[0];
			console.log(
				"Uploading video:",
				file,
				file instanceof File,
				file.type,
				file.size,
			);
			try {
				const playbackId = await uploadToMux(file);
				video_url = `https://stream.mux.com/${playbackId}.m3u8`;
			} catch (error) {
				console.error("Video upload error:", error);
				setError("Video upload failed: " + (error as Error).message);
				setSubmitting(false);
				return;
			}
		}

		if (values.mediaType === "external_video") {
			const externalVideo = getExternalVideoEmbedInfo(values.externalVideoUrl);

			if (!externalVideo) {
				setError("Please enter a valid YouTube or Instagram post URL.");
				setSubmitting(false);
				return;
			}

			external_video_url = externalVideo.canonicalUrl;
		}

		const resolvedGovernmentLevel: "federal" | "provincial" | "municipal" =
			values.governmentLevel || (values.location ? "municipal" : "federal");

		const topicSlug = values.topic;

		// Determine municipal, provincial and federal districts from coordinates
		let municipalDistrict = null;
		let provincialDistrict = null;
		let federalDistrict = null;

		if (values.location && values.location.lat && values.location.lng) {
			const districts = await findDistricts(
				values.location.lat,
				values.location.lng,
			);
			municipalDistrict = districts.municipalDistrict;
			provincialDistrict = districts.provincialDistrict;
			federalDistrict = districts.federalDistrict;
		}

		// Insert issue
		const { data: issueData, error: insertError } = await supabase
			.from("issues")
			.insert({
				type: values.type,
				title: values.title,
				narrative: values.narrative,
				image_url,
				video_url,
				external_video_url,
				media_type: values.mediaType,
				user_id: authorUserId,
				location_lat: values.location?.lat || null,
				location_lng: values.location?.lng || null,
				municipal_district: municipalDistrict,
				provincial_district: provincialDistrict,
				federal_district: federalDistrict,
				topic: topicSlug,
				government_level: resolvedGovernmentLevel,
				province:
					values.location || resolvedGovernmentLevel !== "provincial" ?
						null
					:	values.province || null,
				city:
					values.location || resolvedGovernmentLevel !== "municipal" ?
						null
					:	values.city || null,
			})
			.select()
			.single();

		if (insertError) {
			setError("Could not submit issue");
			setSubmitting(false);
			return;
		}

		// Record on blockchain
		try {
			const anchorIssueToBlockchain = async () => {
				const recordRes = await fetch("/api/blockchain/record-content", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contentId: issueData.id,
						contentType: "issue",
					}),
				});

				if (recordRes.ok) return recordRes;

				let payload: any = null;
				try {
					payload = await recordRes.json();
				} catch {
					payload = null;
				}

				const isMissingIdentity =
					recordRes.status === 400 &&
					(payload?.error === "User has no verified blockchain identity" ||
						String(payload?.error || "")
							.toLowerCase()
							.includes("no verified blockchain identity"));

				if (isMissingIdentity) {
					const retryIdentityRes = await fetch("/api/blockchain/retry", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ type: "identity" }),
					});

					if (!retryIdentityRes.ok) {
						let retryPayload: any = null;
						try {
							retryPayload = await retryIdentityRes.json();
						} catch {
							retryPayload = null;
						}
						throw new Error(
							retryPayload?.error ||
								retryPayload?.details ||
								`Identity bootstrap failed (HTTP ${retryIdentityRes.status})`,
						);
					}

					const retryRecordRes = await fetch("/api/blockchain/record-content", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							contentId: issueData.id,
							contentType: "issue",
						}),
					});

					if (!retryRecordRes.ok) {
						let retryRecordPayload: any = null;
						try {
							retryRecordPayload = await retryRecordRes.json();
						} catch {
							retryRecordPayload = null;
						}
						throw new Error(
							retryRecordPayload?.error ||
								retryRecordPayload?.details ||
								`HTTP ${retryRecordRes.status}`,
						);
					}

					return retryRecordRes;
				}

				throw new Error(
					payload?.error || payload?.details || `HTTP ${recordRes.status}`,
				);
			};

			// Don't block UI for too long, but we want to ensure it starts
			const blockchainPromise = anchorIssueToBlockchain();

			toast.promise(blockchainPromise, {
				loading: "Anchoring to blockchain...",
				success: "Issue permanently recorded on blockchain!",
				error: "Issue created, but blockchain recording failed.",
			});

			await blockchainPromise;
		} catch (e) {
			console.error("Blockchain recording error:", e);
		}

		// Increment user score by 100 points
		const { error: scoreError } = await supabase.rpc("increment_score", {
			user_id: authorUserId,
			points: 100,
		});
		if (scoreError) {
			console.error("Failed to update user score:", scoreError);
			// Don't block the submission if score update fails
		}
		reset();
		setSubmitting(false);
		if (onSubmitted) onSubmitted();
		window.location.reload();
		toast.success("Issue submitted successfully!");
	};

	const toggleMap = () => {
		setIsMapOpen(!isMapOpen);
	};

	const handleMediaSelect = (type: "photo" | "video" | "external_video") => {
		if (mediaType === type) {
			// If clicking same type, do nothing or toggle off?
			// Maybe just focus?
		} else {
			setValue("mediaType", type, { shouldValidate: true });
			setValue("image", undefined);
			setValue("video", undefined);
			if (type !== "external_video") {
				setValue("externalVideoUrl", "", { shouldValidate: true });
			}
		}
	};

	return (
		<Card className="border-none shadow-none p-0">
			<CardContent className="p-0">
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label
								htmlFor="type-select"
								className="text-xs font-medium text-muted-foreground"
							>
								Type
							</Label>
							<Select
								value={type}
								onValueChange={(v) =>
									setValue("type", v as IssueFormValues["type"], {
										shouldValidate: true,
									})
								}
								disabled={submitting || !user || loading}
								name="type"
							>
								<SelectTrigger
									id="type-select"
									aria-invalid={!!errors.type}
									className="w-full h-9 text-sm"
								>
									<SelectValue placeholder="Select type..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Problem">Problem</SelectItem>
									<SelectItem value="Idea">Idea</SelectItem>
									<SelectItem value="Question">Question</SelectItem>
								</SelectContent>
							</Select>
							{errors.type && (
								<p className="text-destructive text-[10px]">
									{errors.type.message as string}
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label
								htmlFor="topic-select"
								className="text-xs font-medium text-muted-foreground"
							>
								Topic
							</Label>
							<Select
								value={topic}
								onValueChange={(v) =>
									setValue("topic", v as IssueFormValues["topic"], {
										shouldValidate: true,
									})
								}
								disabled={submitting || !user || loading}
								name="topic"
							>
								<SelectTrigger
									id="topic-select"
									aria-invalid={!!errors.topic}
									className="w-full h-9 text-sm"
								>
									<SelectValue placeholder="Select topic..." />
								</SelectTrigger>
								<SelectContent>
									{TOPIC_OPTIONS.map((t) => (
										<SelectItem key={t.value} value={t.value}>
											{t.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.topic && (
								<p className="text-destructive text-[10px]">
									{errors.topic.message as string}
								</p>
							)}
						</div>
					</div>

					{/* Government Level Selector */}
					<div className="space-y-1.5">
						<Label className="text-xs font-medium text-muted-foreground">
							Government Level (optional)
						</Label>
						<div className="flex gap-2">
							{[
								{ value: "federal", label: "Federal", icon: Building2 },
								{ value: "provincial", label: "Provincial", icon: Home },
								{ value: "municipal", label: "Municipal", icon: Landmark },
							].map(({ value, label, icon: Icon }) => (
								<Button
									key={value}
									type="button"
									variant={governmentLevel === value ? "secondary" : "outline"}
									size="sm"
									className={cn(
										"flex-1 h-9 text-xs",
										governmentLevel === value ?
											"bg-primary/10 text-primary border-primary/30"
										:	"text-muted-foreground",
									)}
									onClick={() =>
										setValue(
											"governmentLevel",
											governmentLevel === value ? null : (
												(value as "federal" | "provincial" | "municipal")
											),
											{ shouldValidate: true },
										)
									}
									disabled={submitting || !user || loading}
								>
									<Icon className="mr-1.5 h-3.5 w-3.5" />
									{label}
								</Button>
							))}
						</div>
						<p className="text-[10px] text-muted-foreground">
							Select if this is a policy/general issue for a level of
							government, not location-specific.
						</p>
					</div>

					{!location && governmentLevel === "provincial" && (
						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								Province (optional)
							</Label>
							<Select
								value={province || "all"}
								onValueChange={(v) =>
									setValue("province", v === "all" ? null : v, {
										shouldValidate: true,
									})
								}
								disabled={
									submitting || !user || loading || loadingPlaceDefaults
								}
							>
								<SelectTrigger className="w-full h-9 text-sm">
									<SelectValue placeholder="Select province..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Provinces</SelectItem>
									{PROVINCES.map((p) => (
										<SelectItem key={p} value={p}>
											{p}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{!location && governmentLevel === "municipal" && (
						<div className="space-y-1.5">
							<Label className="text-xs font-medium text-muted-foreground">
								City (optional)
							</Label>
							<Select
								value={city || "all"}
								onValueChange={(v) =>
									setValue("city", v === "all" ? null : v, {
										shouldValidate: true,
									})
								}
								disabled={
									submitting || !user || loading || loadingPlaceDefaults
								}
							>
								<SelectTrigger className="w-full h-9 text-sm">
									<SelectValue placeholder="Select city..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Cities</SelectItem>
									{availableCities.slice(0, 200).map((c) => (
										<SelectItem key={c} value={c}>
											{c}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="space-y-1.5">
						<Input
							placeholder="Give your issue a clear title"
							{...register("title")}
							disabled={submitting || !user || loading}
							aria-invalid={!!errors.title}
							className="text-base font-semibold h-10"
						/>
						{errors.title && (
							<p className="text-destructive text-[10px]">
								{errors.title.message}
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<Textarea
							placeholder="Describe the issue in detail..."
							{...register("narrative")}
							disabled={submitting || !user || loading}
							aria-invalid={!!errors.narrative}
							className="min-h-[100px] resize-none text-sm"
						/>
						{errors.narrative && (
							<p className="text-destructive text-[10px]">
								{errors.narrative.message}
							</p>
						)}
					</div>

					{/* Media & Location Toolbar */}
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2 border-t pt-3">
							<Button
								type="button"
								variant={location ? "secondary" : "ghost"}
								size="sm"
								onClick={toggleMap}
								className={cn(
									"h-8 text-xs",
									location ? "text-primary" : "text-muted-foreground",
								)}
							>
								<MapPin className="mr-2 h-3.5 w-3.5" />
								{location ? "Edit Location" : "Add Location"}
							</Button>

							<div className="h-4 w-px bg-border mx-1" />

							<Button
								type="button"
								variant={mediaType === "photo" ? "secondary" : "ghost"}
								size="sm"
								onClick={() => handleMediaSelect("photo")}
								className={cn(
									"h-8 text-xs",
									mediaType === "photo" ? "text-primary" : (
										"text-muted-foreground"
									),
								)}
							>
								<ImageIcon className="mr-2 h-3.5 w-3.5" />
								Photo
							</Button>
							<Button
								type="button"
								variant={mediaType === "video" ? "secondary" : "ghost"}
								size="sm"
								onClick={() => handleMediaSelect("video")}
								className={cn(
									"h-8 text-xs",
									mediaType === "video" ? "text-primary" : (
										"text-muted-foreground"
									),
								)}
							>
								<VideoIcon className="mr-2 h-3.5 w-3.5" />
								Video
							</Button>
							<Button
								type="button"
								variant={mediaType === "external_video" ? "secondary" : "ghost"}
								size="sm"
								onClick={() => handleMediaSelect("external_video")}
								className={cn(
									"h-8 text-xs",
									mediaType === "external_video" ? "text-primary" : (
										"text-muted-foreground"
									),
								)}
							>
								<Link2 className="mr-2 h-3.5 w-3.5" />
								Instagram/YouTube URL
							</Button>
						</div>

						{/* Dynamic Content Area */}
						<div className="space-y-3">
							{/* Location Preview */}
							{!isMapOpen && location && (
								<div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
									<div className="flex items-center gap-2">
										<div className="bg-primary/10 p-1.5 rounded-full">
											<MapPin className="h-3.5 w-3.5 text-primary" />
										</div>
										<div className="flex flex-col">
											<span className="text-xs font-medium">
												Location selected
											</span>
											<span className="text-[10px] text-muted-foreground">
												{location.lat.toFixed(4)}, {location.lng.toFixed(4)}
											</span>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-6 w-6"
										onClick={() => setValue("location", null)}
									>
										<X className="h-3.5 w-3.5" />
									</Button>
								</div>
							)}

							{mediaType === "external_video" && (
								<div className="p-3 border rounded-lg bg-muted/30 relative animate-in fade-in slide-in-from-top-2">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute top-2 right-2 h-5 w-5"
										onClick={() => {
											setValue("mediaType", undefined);
											setValue("externalVideoUrl", "", {
												shouldValidate: true,
											});
										}}
									>
										<X className="h-3 w-3" />
									</Button>
									<div className="space-y-2">
										<Label className="text-xs font-medium flex items-center gap-2">
											<Link2 className="h-3.5 w-3.5" />
											Instagram / YouTube URL
										</Label>
										<Input
											type="url"
											placeholder="https://www.youtube.com/watch?v=... or https://www.instagram.com/reel/..."
											{...register("externalVideoUrl")}
											disabled={submitting || !user || loading}
											className="bg-background h-8 text-xs"
										/>
										<p className="text-[10px] text-muted-foreground">
											Supports YouTube (watch, shorts, youtu.be) and Instagram
											(reel/post).
										</p>
										{externalVideoUrl && !externalVideoPreview && (
											<p className="text-[10px] text-destructive">
												Enter a valid YouTube or Instagram URL.
											</p>
										)}
										{externalVideoPreview && (
											<p className="text-[10px] text-muted-foreground">
												Detected provider: {externalVideoPreview.provider}
											</p>
										)}
									</div>
								</div>
							)}

							{/* Map */}
							<Collapsible open={isMapOpen} onOpenChange={setIsMapOpen}>
								<CollapsibleContent className="space-y-2">
									<div className="relative border rounded-lg overflow-hidden shadow-sm">
										<Button
											type="button"
											variant="secondary"
											size="icon"
											className="absolute top-2 right-2 z-[400] h-7 w-7 bg-background/80 backdrop-blur-sm hover:bg-background"
											onClick={() => setIsMapOpen(false)}
										>
											<X className="h-3.5 w-3.5" />
										</Button>
										<MapPicker
											value={location || undefined}
											onChange={(coords) =>
												setValue("location", coords, { shouldValidate: true })
											}
											modalOpen={isMapOpen}
											className="h-40"
										/>
									</div>
									<p className="text-[10px] text-center text-muted-foreground">
										Click on the map to pin the location.
									</p>
								</CollapsibleContent>
							</Collapsible>

							{/* Media Uploads */}
							{mediaType === "photo" && (
								<div className="p-3 border rounded-lg bg-muted/30 relative animate-in fade-in slide-in-from-top-2">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute top-2 right-2 h-5 w-5"
										onClick={() => {
											setValue("mediaType", undefined);
											setValue("image", undefined);
										}}
									>
										<X className="h-3 w-3" />
									</Button>
									<div className="space-y-2">
										<Label className="text-xs font-medium flex items-center gap-2">
											<ImageIcon className="h-3.5 w-3.5" /> Upload Photo
										</Label>
										<Input
											type="file"
											accept="image/*"
											{...register("image")}
											disabled={submitting || !user || loading}
											className="bg-background h-8 text-xs"
										/>
										{image && image.length > 0 && (
											<p className="text-[10px] text-muted-foreground">
												Selected: {image[0]?.name}
											</p>
										)}
									</div>
								</div>
							)}

							{mediaType === "video" && (
								<div className="p-3 border rounded-lg bg-muted/30 relative animate-in fade-in slide-in-from-top-2">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute top-2 right-2 h-5 w-5"
										onClick={() => {
											setValue("mediaType", undefined);
											setValue("video", undefined);
										}}
									>
										<X className="h-3 w-3" />
									</Button>
									<div className="space-y-2">
										<Label className="text-xs font-medium flex items-center gap-2">
											<VideoIcon className="h-3.5 w-3.5" /> Upload Video
										</Label>
										<Input
											type="file"
											accept="video/*"
											{...register("video")}
											disabled={submitting || !user || loading}
											className="bg-background h-8 text-xs"
										/>
										{submitting && uploadProgress > 0 && (
											<div className="space-y-1">
												<div className="flex justify-between text-[10px] text-muted-foreground">
													<span>Uploading...</span>
													<span>{uploadProgress}%</span>
												</div>
												<div className="w-full bg-secondary rounded-full h-1 overflow-hidden">
													<div
														className="bg-primary h-full transition-all duration-300"
														style={{ width: `${uploadProgress}%` }}
													></div>
												</div>
											</div>
										)}
									</div>
								</div>
							)}

							{errors.mediaType && (
								<p className="text-destructive text-[10px]">
									{errors.mediaType.message}
								</p>
							)}
						</div>
					</div>

					{error && (
						<div className="p-2 text-xs text-destructive bg-destructive/10 rounded-md">
							{error}
						</div>
					)}

					{isMember && (
						<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
							<p className="font-medium">Members cannot post issues</p>
							<p className="text-xs mt-1">
								<a
									href="/signup/verified"
									className="text-primary hover:underline font-medium"
								>
									Become a verified resident
								</a>{" "}
								to post issues and access all features.
							</p>
						</div>
					)}

					<Button
						type="submit"
						className="w-full"
						disabled={submitting || !user || loading || isMember}
					>
						{submitting ?
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Submitting...
							</>
						: isMember ?
							"Verify to Post"
						: user ?
							"Submit Issue"
						:	"Log in to submit"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
