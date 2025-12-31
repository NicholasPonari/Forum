"use client";
import { createClient } from "@/lib/supabaseClient";
import { notFound } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/page_components/header";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Profile, Issue } from "@/lib/types/db";
import {
	CalendarDays,
	MapPin,
	Globe,
	Edit,
	Save,
	X,
	Bookmark as BookmarkIcon,
	Camera,
	User,
	FileText,
	MessageSquare,
	Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { formatTimeAgo } from "@/lib/timeUtils";
import { ProfileDistricts } from "@/components/ProfileDistricts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface UserComment {
	id: string;
	issue_id: number;
	content: string;
	created_at: string;
	issue_title?: string;
}

// Ensure list-like values are normalized to string[] regardless of whether
// the database returns an array, a JSON string, or a comma-separated string.
function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((v) => String(v));
	if (typeof value === "string") {
		const s = value.trim();
		// Try JSON parse first: e.g. "[\"a\",\"b\"]"
		if (
			(s.startsWith("[") && s.endsWith("]")) ||
			(s.startsWith('"') && s.endsWith('"'))
		) {
			try {
				const parsed = JSON.parse(s);
				if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v));
			} catch {
				// fall through to CSV split
			}
		}
		// Fallback: comma-separated list
		return s
			.split(",")
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
	}
	return [];
}

function normalizeExternalUrl(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";

	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (/^\/\//.test(trimmed)) return `https:${trimmed}`;

	return `https://${trimmed}`;
}

async function fetchProfile(id: string): Promise<Profile | null> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("profiles")
		.select(
			`id, created_at, username, first_name, last_name, bio, interests, issues_cared_about, bookmarks, location, website, avatar_url, type, verified, language`
		)
		.eq("id", id)
		.single();
	if (error) return null;
	return data as Profile;
}

export default function ProfilePage() {
	const params = useParams();
	const { user } = useAuth();
	const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [editForm, setEditForm] = useState({
		first_name: "",
		last_name: "",
		bio: "",
		interests: [] as string[],
		issues_cared_about: [] as string[],
		location: "",
		website: "",
	});
	const [newInterest, setNewInterest] = useState("");
	const [newIssue, setNewIssue] = useState("");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [bookmarkedIssues, setBookmarkedIssues] = useState<Issue[]>([]);
	const [loadingBookmarks, setLoadingBookmarks] = useState(false);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [uploadingAvatar, setUploadingAvatar] = useState(false);
	const [userPosts, setUserPosts] = useState<Issue[]>([]);
	const [userComments, setUserComments] = useState<UserComment[]>([]);
	const [loadingPosts, setLoadingPosts] = useState(false);
	const [loadingComments, setLoadingComments] = useState(false);
	const [updatingLanguage, setUpdatingLanguage] = useState(false);

	useEffect(() => {
		const loadProfile = async () => {
			if (!params.profileID || typeof params.profileID !== "string") {
				notFound();
				return;
			}

			const profileData = await fetchProfile(params.profileID);
			if (!profileData) {
				notFound();
				return;
			}
			// Normalize list fields to string[] to avoid runtime errors
			const normalizedInterests = toStringArray(
				profileData.interests as unknown
			);
			const normalizedIssues = toStringArray(
				profileData.issues_cared_about as unknown
			);

			setProfile({
				...profileData,
				interests: normalizedInterests,
				issues_cared_about: normalizedIssues,
			});
			setEditForm({
				first_name: profileData.first_name || "",
				last_name: profileData.last_name || "",
				bio: profileData.bio || "",
				interests: normalizedInterests,
				issues_cared_about: normalizedIssues,
				location: profileData.location || "",
				website: profileData.website || "",
			});
			setLoading(false);
		};

		const loadBookmarkedIssues = async () => {
			if (!params.profileID || typeof params.profileID !== "string") return;

			setLoadingBookmarks(true);
			const supabase = createClient();

			// Get the profile's bookmarked posts
			const { data: profileData } = await supabase
				.from("profiles")
				.select("bookmarks")
				.eq("id", params.profileID)
				.single();

			if (profileData?.bookmarks && profileData.bookmarks.length > 0) {
				// Fetch the issues
				const { data: issues } = await supabase
					.from("issues")
					.select("*")
					.in(
						"id",
						profileData.bookmarks.map((id: string) => parseInt(id))
					);

				if (issues) {
					setBookmarkedIssues(issues as Issue[]);
				}
			}
			setLoadingBookmarks(false);
		};

		const loadUserPosts = async () => {
			if (!params.profileID || typeof params.profileID !== "string") return;

			setLoadingPosts(true);
			const supabase = createClient();

			const { data: posts } = await supabase
				.from("issues")
				.select("*")
				.eq("user_id", params.profileID)
				.order("created_at", { ascending: false });

			if (posts) {
				setUserPosts(posts as Issue[]);
			}
			setLoadingPosts(false);
		};

		const loadUserComments = async () => {
			if (!params.profileID || typeof params.profileID !== "string") return;

			setLoadingComments(true);
			const supabase = createClient();

			// Fetch comments with issue title
			const { data: comments } = await supabase
				.from("comments")
				.select("id, issue_id, content, created_at, issues(title)")
				.eq("user_id", params.profileID)
				.order("created_at", { ascending: false });

			if (comments) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const formattedComments: UserComment[] = comments.map((c: any) => ({
					id: c.id,
					issue_id: c.issue_id,
					content: c.content,
					created_at: c.created_at,
					issue_title: c.issues?.title || "Unknown Post",
				}));
				setUserComments(formattedComments);
			}
			setLoadingComments(false);
		};

		loadProfile();
		loadBookmarkedIssues();
		loadUserPosts();
		loadUserComments();
	}, [params.profileID]);

	const isOwnProfile = user?.id === profile?.id;
	const upgradeHref = profile?.id
		? `/signup/verified?mode=upgrade&returnTo=${encodeURIComponent(
				`/profile/${profile.id}`
		  )}`
		: "/signup/verified";

	const handleSaveProfile = async () => {
		if (!profile) return;

		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);

		try {
			const supabase = createClient();
			let avatarUrl = profile.avatar_url;

			// Handle avatar upload if a new file was selected
			if (avatarFile) {
				setUploadingAvatar(true);

				// Delete old avatar if it exists
				if (profile.avatar_url) {
					const oldFileName = profile.avatar_url.split("/").pop();
					if (oldFileName) {
						await supabase.storage.from("profile-images").remove([oldFileName]);
					}
				}

				// Upload new avatar with unique filename
				const fileExt = avatarFile.name.split(".").pop();
				const fileName = `${profile.id}-${Date.now()}.${fileExt}`;

				const { error: uploadError } = await supabase.storage
					.from("profile-images")
					.upload(fileName, avatarFile, {
						upsert: true,
						contentType: avatarFile.type,
					});

				if (uploadError) {
					throw new Error(`Failed to upload avatar: ${uploadError.message}`);
				}

				// Get public URL
				const {
					data: { publicUrl },
				} = supabase.storage.from("profile-images").getPublicUrl(fileName);

				avatarUrl = publicUrl;
				setUploadingAvatar(false);
			}

			// Update profile with form data and avatar URL
			const updateData = {
				...editForm,
				...(avatarUrl && { avatar_url: avatarUrl }),
			};

			const { error } = await supabase
				.from("profiles")
				.update(updateData)
				.eq("id", profile.id);

			if (error) {
				setSaveError("Failed to save profile. Please try again.");
				console.error("Profile save error:", error);
			} else {
				setProfile({ ...profile, ...updateData });
				setSaveSuccess(true);
				setIsEditing(false);
				setAvatarFile(null);
				setAvatarPreview(null);
				// Hide success message after 3 seconds
				setTimeout(() => setSaveSuccess(false), 3000);
			}
		} catch (error) {
			setSaveError(
				error instanceof Error
					? error.message
					: "An unexpected error occurred. Please try again."
			);
			console.error("Unexpected error:", error);
		} finally {
			setSaving(false);
			setUploadingAvatar(false);
		}
	};

	const addInterest = () => {
		if (
			newInterest.trim() &&
			!editForm.interests.includes(newInterest.trim())
		) {
			setEditForm((prev) => ({
				...prev,
				interests: [...prev.interests, newInterest.trim()],
			}));
			setNewInterest("");
		}
	};

	const removeInterest = (interest: string) => {
		setEditForm((prev) => ({
			...prev,
			interests: prev.interests.filter((i) => i !== interest),
		}));
	};

	const addIssue = () => {
		if (
			newIssue.trim() &&
			!editForm.issues_cared_about.includes(newIssue.trim())
		) {
			setEditForm((prev) => ({
				...prev,
				issues_cared_about: [...prev.issues_cared_about, newIssue.trim()],
			}));
			setNewIssue("");
		}
	};

	const removeIssue = (issue: string) => {
		setEditForm((prev) => ({
			...prev,
			issues_cared_about: prev.issues_cared_about.filter((i) => i !== issue),
		}));
	};

	// Helper function to crop image to square
	const cropImageToSquare = (file: File): Promise<File> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					// Create canvas with square dimensions
					const size = Math.min(img.width, img.height);
					const canvas = document.createElement("canvas");
					canvas.width = size;
					canvas.height = size;

					const ctx = canvas.getContext("2d");
					if (!ctx) {
						reject(new Error("Failed to get canvas context"));
						return;
					}

					// Calculate crop position (center crop)
					const xOffset = (img.width - size) / 2;
					const yOffset = (img.height - size) / 2;

					// Draw cropped image
					ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, size, size);

					// Convert canvas to blob
					canvas.toBlob(
						(blob) => {
							if (!blob) {
								reject(new Error("Failed to create blob"));
								return;
							}

							// Create new file from blob
							const croppedFile = new File([blob], file.name, {
								type: file.type,
								lastModified: Date.now(),
							});
							resolve(croppedFile);
						},
						file.type,
						0.95
					); // 0.95 quality for good balance
				};
				img.onerror = () => reject(new Error("Failed to load image"));
				img.src = e.target?.result as string;
			};
			reader.onerror = () => reject(new Error("Failed to read file"));
			reader.readAsDataURL(file);
		});
	};

	const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			// Validate file type
			if (!file.type.startsWith("image/")) {
				setSaveError("Please select an image file");
				return;
			}

			// Validate file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				setSaveError("Image size must be less than 5MB");
				return;
			}

			try {
				// Crop image to square
				const croppedFile = await cropImageToSquare(file);
				setAvatarFile(croppedFile);
				setSaveError(null);

				// Create preview
				const reader = new FileReader();
				reader.onloadend = () => {
					setAvatarPreview(reader.result as string);
				};
				reader.readAsDataURL(croppedFile);
			} catch (error) {
				setSaveError("Failed to process image. Please try another file.");
				console.error("Image processing error:", error);
			}
		}
	};

	const handleLanguageChange = async (value: string) => {
		if (!profile) return;
		setUpdatingLanguage(true);

		const supabase = createClient();
		const { error } = await supabase
			.from("profiles")
			.update({ language: value })
			.eq("id", profile.id);

		if (error) {
			console.error("Error updating language:", error);
			// You might want to show a toast or error message here
		} else {
			setProfile({ ...profile, language: value as "en" | "fr" });
		}
		setUpdatingLanguage(false);
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50">
				<Header />
				<div className="flex items-center justify-center h-64">
					<div className="text-lg">Loading profile...</div>
				</div>
			</div>
		);
	}

	if (!profile) {
		return notFound();
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<Header />
			<div className="container mx-auto px-4 py-8 max-w-6xl">
				{/* Profile Header */}
				<Card className="mb-8">
					<CardContent className="p-6">
						<div className="flex flex-col md:flex-row items-start gap-6">
							<Avatar className="h-24 w-24">
								<AvatarImage src={profile.avatar_url || ""} />
								<AvatarFallback className="bg-gray-200">
									<User className="w-12 h-12 text-gray-500" />
								</AvatarFallback>
							</Avatar>

							<div className="flex-1">
								<div className="flex items-center justify-between mb-2">
									<h1 className="text-3xl font-bold">
										{profile.first_name && profile.last_name
											? `${profile.first_name} ${profile.last_name}`
											: profile.username || "Anonymous User"}
									</h1>
									{isOwnProfile && (
										<div className="flex items-center gap-2">
											{profile.type === "Member" && (
												<Link href={upgradeHref}>
													<Button size="sm" variant="default">
														Upgrade to Resident
													</Button>
												</Link>
											)}
											<Button
												variant={isEditing ? "outline" : "default"}
												size="sm"
												onClick={() => setIsEditing(!isEditing)}
											>
												{isEditing ? (
													<X className="h-4 w-4 mr-2" />
												) : (
													<Edit className="h-4 w-4 mr-2" />
												)}
												{isEditing ? "Cancel" : "Edit Profile"}
											</Button>
										</div>
									)}
								</div>

								<div className="flex flex-wrap items-center gap-2 mb-2">
									{profile.username && (
										<p className="text-gray-600">@{profile.username}</p>
									)}
									{profile.type && (
										<Badge variant="outline">{profile.type}</Badge>
									)}
								</div>

								<div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
									<div className="flex items-center gap-1">
										<CalendarDays className="h-4 w-4" />
										Joined{" "}
										{new Date(profile.created_at || "").toLocaleDateString()}
									</div>
									{profile.location && (
										<div className="flex items-center gap-1">
											<MapPin className="h-4 w-4" />
											{profile.location}
										</div>
									)}
									{profile.website && (
										<a
											href={normalizeExternalUrl(profile.website)}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
										>
											<Globe className="h-4 w-4" />
											Website
										</a>
									)}
								</div>

								{profile.bio && (
									<p className="text-gray-700 mb-4">{profile.bio}</p>
								)}

								{/* Interests */}
								{profile.interests && profile.interests.length > 0 && (
									<div className="mb-4">
										<h3 className="text-sm font-medium text-gray-700 mb-2">
											Interests
										</h3>
										<div className="flex flex-wrap gap-2">
											{profile.interests.map((interest, index) => (
												<Badge key={index} variant="outline">
													{interest}
												</Badge>
											))}
										</div>
									</div>
								)}

								{/* Issues Cared About */}
								{profile.issues_cared_about &&
									profile.issues_cared_about.length > 0 && (
										<div>
											<h3 className="text-sm font-medium text-gray-700 mb-2">
												Issues I Care About
											</h3>
											<div className="flex flex-wrap gap-2">
												{profile.issues_cared_about.map((issue, index) => (
													<Badge key={index} variant="outline">
														{issue}
													</Badge>
												))}
											</div>
										</div>
									)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Settings Section - Only visible to own profile */}
				{isOwnProfile && (
					<Card className="mb-8">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<SettingsIcon className="h-5 w-5" />
								Settings
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="max-w-xs">
								<Label className="mb-2 block">Language</Label>
								<Select
									value={profile.language || "en"}
									onValueChange={handleLanguageChange}
									disabled={updatingLanguage}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select Language" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="en">English</SelectItem>
										<SelectItem value="fr">French</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-sm text-muted-foreground mt-2">
									Choose your preferred language for the interface.
								</p>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Electoral Districts */}
				{profile.id && (
					<ProfileDistricts profileId={profile.id} className="mb-8" />
				)}

				{/* Success Message */}
				{saveSuccess && (
					<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md mb-4">
						Profile updated successfully!
					</div>
				)}

				{/* Edit Profile Form */}
				{isEditing && isOwnProfile && (
					<Card className="mb-8">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Edit className="h-5 w-5" />
								Edit Profile
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							{/* Avatar Upload */}
							<div>
								<Label>Profile Picture</Label>
								<div className="flex items-center gap-4 mt-2">
									<Avatar className="h-24 w-24">
										<AvatarImage
											src={avatarPreview || profile.avatar_url || ""}
										/>
										<AvatarFallback className="bg-gray-200">
											<User className="w-12 h-12 text-gray-500" />
										</AvatarFallback>
									</Avatar>
									<div className="flex flex-col gap-2">
										<Label
											htmlFor="avatar-upload"
											className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors w-fit"
										>
											<Camera className="h-4 w-4" />
											{avatarFile ? "Change Photo" : "Upload Photo"}
										</Label>
										<Input
											id="avatar-upload"
											type="file"
											accept="image/*"
											onChange={handleAvatarChange}
											className="hidden"
										/>
										{avatarFile && (
											<p className="text-sm text-gray-600">
												Selected: {avatarFile.name}
											</p>
										)}
										{uploadingAvatar && (
											<p className="text-sm text-blue-600">
												Uploading avatar...
											</p>
										)}
									</div>
								</div>
								<p className="text-sm text-gray-500 mt-2">
									Images will be automatically cropped to square. Max 5MB.
								</p>
							</div>

							{/* Basic Information */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<Label htmlFor="first_name">First Name</Label>
									<Input
										id="first_name"
										value={editForm.first_name}
										onChange={(e) =>
											setEditForm((prev) => ({
												...prev,
												first_name: e.target.value,
											}))
										}
										placeholder="Enter your first name"
									/>
								</div>
								<div>
									<Label htmlFor="last_name">Last Name</Label>
									<Input
										id="last_name"
										value={editForm.last_name}
										onChange={(e) =>
											setEditForm((prev) => ({
												...prev,
												last_name: e.target.value,
											}))
										}
										placeholder="Enter your last name"
									/>
								</div>
							</div>

							{/* Bio */}
							<div>
								<Label htmlFor="bio">Bio</Label>
								<Textarea
									id="bio"
									value={editForm.bio}
									onChange={(e) =>
										setEditForm((prev) => ({
											...prev,
											bio: e.target.value,
										}))
									}
									placeholder="Tell us about yourself..."
									rows={4}
								/>
							</div>

							{/* Location and Website */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<Label htmlFor="location">Location</Label>
									<Input
										id="location"
										value={editForm.location}
										onChange={(e) =>
											setEditForm((prev) => ({
												...prev,
												location: e.target.value,
											}))
										}
										placeholder="City, State/Country"
									/>
								</div>
								<div>
									<Label htmlFor="website">Website</Label>
									<Input
										id="website"
										value={editForm.website}
										onChange={(e) =>
											setEditForm((prev) => ({
												...prev,
												website: e.target.value,
											}))
										}
										placeholder="https://yourwebsite.com"
									/>
								</div>
							</div>

							{/* Interests */}
							<div>
								<Label>Interests</Label>
								<div className="space-y-2 mt-2">
									<div className="flex gap-2">
										<Input
											value={newInterest}
											onChange={(e) => setNewInterest(e.target.value)}
											placeholder="Add an interest"
											onKeyPress={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addInterest();
												}
											}}
										/>
										<Button
											type="button"
											variant="outline"
											onClick={addInterest}
											disabled={!newInterest.trim()}
										>
											Add
										</Button>
									</div>
									{editForm.interests.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{editForm.interests.map((interest, index) => (
												<Badge
													key={index}
													variant="default"
													className="cursor-pointer hover:bg-red-100"
													onClick={() => removeInterest(interest)}
												>
													{interest} ×
												</Badge>
											))}
										</div>
									)}
								</div>
							</div>

							{/* Issues Cared About */}
							<div>
								<Label>Issues I Care About</Label>
								<div className="space-y-2">
									<div className="flex gap-2">
										<Input
											value={newIssue}
											onChange={(e) => setNewIssue(e.target.value)}
											placeholder="Add an issue you care about"
											onKeyPress={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addIssue();
												}
											}}
										/>
										<Button
											type="button"
											variant="outline"
											onClick={addIssue}
											disabled={!newIssue.trim()}
										>
											Add
										</Button>
									</div>
									{editForm.issues_cared_about.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{editForm.issues_cared_about.map((issue, index) => (
												<Badge
													key={index}
													variant="outline"
													className="cursor-pointer hover:bg-red-100"
													onClick={() => removeIssue(issue)}
												>
													{issue} ×
												</Badge>
											))}
										</div>
									)}
								</div>
							</div>

							{/* Error Display */}
							{saveError && (
								<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
									{saveError}
								</div>
							)}

							{/* Action Buttons */}
							<div className="flex gap-2 pt-4">
								<Button
									onClick={handleSaveProfile}
									disabled={saving || uploadingAvatar}
									className="flex items-center gap-2"
								>
									<Save className="h-4 w-4" />
									{uploadingAvatar
										? "Uploading Avatar..."
										: saving
										? "Saving..."
										: "Save Changes"}
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										setIsEditing(false);
										setSaveError(null);
										setAvatarFile(null);
										setAvatarPreview(null);
									}}
									disabled={saving || uploadingAvatar}
									className="flex items-center gap-2"
								>
									<X className="h-4 w-4" />
									Cancel
								</Button>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Bookmarked Posts Section */}
				{isOwnProfile && (
					<Card>
						<CardHeader>
							<CardTitle className="flex mt-6 items-center gap-2">
								<BookmarkIcon className="h-5 w-5" />
								Bookmarked Posts
							</CardTitle>
						</CardHeader>
						<CardContent>
							{loadingBookmarks ? (
								<div className="text-center py-8 text-gray-500">
									Loading bookmarks...
								</div>
							) : bookmarkedIssues.length === 0 ? (
								<div className="text-center py-8 text-gray-500">
									No bookmarked posts yet
								</div>
							) : (
								<div className="space-y-4">
									{bookmarkedIssues.map((issue) => (
										<div
											key={issue.id}
											className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
										>
											<div className="flex items-start justify-between gap-4">
												<div className="flex-1">
													<Link href={`/${issue.id}`}>
														<h3 className="font-semibold text-lg text-gray-900 hover:text-blue-600 cursor-pointer mb-1">
															{issue.title}
														</h3>
													</Link>
													{issue.narrative && (
														<p className="text-gray-600 text-sm mb-2 line-clamp-2">
															{issue.narrative}
														</p>
													)}
													<div className="flex items-center gap-2 text-xs text-gray-500">
														{issue.type && (
															<Badge
																className={`
																	text-[10px] px-2 py-0.5 capitalize
																	${issue.type === "Problem" ? "bg-red-100 text-red-800 border-red-200" : ""}
																	${issue.type === "Idea" ? "bg-green-100 text-green-800 border-green-200" : ""}
																	${issue.type === "Question" ? "bg-blue-100 text-blue-800 border-blue-200" : ""}
																`}
																variant="outline"
															>
																{issue.type}
															</Badge>
														)}
														<span>•</span>
														<span>{formatTimeAgo(issue.created_at)}</span>
													</div>
												</div>
												<Button
													variant="ghost"
													size="sm"
													onClick={async () => {
														try {
															const response = await fetch("/api/bookmarks", {
																method: "POST",
																headers: {
																	"Content-Type": "application/json",
																},
																body: JSON.stringify({
																	issueId: issue.id,
																	action: "remove",
																}),
															});
															if (response.ok) {
																setBookmarkedIssues((prev) =>
																	prev.filter((i) => i.id !== issue.id)
																);
															}
														} catch (error) {
															console.error("Error removing bookmark:", error);
														}
													}}
													className="text-red-600 hover:text-red-800 hover:bg-red-50"
												>
													<X className="h-4 w-4 mr-1" />
													Remove
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				)}

				{/* User Activity Section - Posts and Comments */}
				<Card className="mt-8">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="h-5 w-5" />
							Activity
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="posts" className="w-full">
							<TabsList className="grid w-full grid-cols-2 mb-4">
								<TabsTrigger value="posts" className="flex items-center gap-2">
									<FileText className="h-4 w-4" />
									Posts ({userPosts.length})
								</TabsTrigger>
								<TabsTrigger
									value="comments"
									className="flex items-center gap-2"
								>
									<MessageSquare className="h-4 w-4" />
									Comments ({userComments.length})
								</TabsTrigger>
							</TabsList>

							{/* Posts Tab */}
							<TabsContent value="posts">
								{loadingPosts ? (
									<div className="text-center py-8 text-gray-500">
										Loading posts...
									</div>
								) : userPosts.length === 0 ? (
									<div className="text-center py-8 text-gray-500">
										No posts yet
									</div>
								) : (
									<div className="space-y-4">
										{userPosts.map((post) => (
											<div
												key={post.id}
												className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
											>
												<div className="flex items-start justify-between gap-4">
													<div className="flex-1">
														<Link href={`/${post.id}`}>
															<h3 className="font-semibold text-lg text-gray-900 hover:text-blue-600 cursor-pointer mb-1">
																{post.title}
															</h3>
														</Link>
														{post.narrative && (
															<p className="text-gray-600 text-sm mb-2 line-clamp-2">
																{post.narrative}
															</p>
														)}
														<div className="flex items-center gap-2 text-xs text-gray-500">
															{post.type && (
																<Badge
																	className={`
																		text-[10px] px-2 py-0.5 capitalize
																		${post.type === "Problem" ? "bg-red-100 text-red-800 border-red-200" : ""}
																		${post.type === "Idea" ? "bg-green-100 text-green-800 border-green-200" : ""}
																		${post.type === "Question" ? "bg-blue-100 text-blue-800 border-blue-200" : ""}
																	`}
																	variant="outline"
																>
																	{post.type}
																</Badge>
															)}
															<span>•</span>
															<span>{formatTimeAgo(post.created_at)}</span>
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								)}
							</TabsContent>

							{/* Comments Tab */}
							<TabsContent value="comments">
								{loadingComments ? (
									<div className="text-center py-8 text-gray-500">
										Loading comments...
									</div>
								) : userComments.length === 0 ? (
									<div className="text-center py-8 text-gray-500">
										No comments yet
									</div>
								) : (
									<div className="space-y-4">
										{userComments.map((comment) => (
											<div
												key={comment.id}
												className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
											>
												<div className="flex flex-col gap-2">
													<Link href={`/${comment.issue_id}`}>
														<p className="text-sm text-blue-600 hover:text-blue-800 font-medium">
															On: {comment.issue_title}
														</p>
													</Link>
													<p className="text-gray-700 line-clamp-3">
														{comment.content}
													</p>
													<span className="text-xs text-gray-500">
														{formatTimeAgo(comment.created_at)}
													</span>
												</div>
											</div>
										))}
									</div>
								)}
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
