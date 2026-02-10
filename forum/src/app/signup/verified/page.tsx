"use client";

import React, { Suspense, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabaseClient";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import {
	Shield,
	Bot,
	Lock,
	UserCheck,
	Camera,
	CheckCircle2,
	ArrowLeft,
	Loader2,
	BadgeCheck,
	Upload,
} from "lucide-react";

import Link from "next/link";
import Image from "next/image";
import LivenessCapture from "@/components/LivenessCapture";
import IdCapture from "@/components/IdCapture";
import { ProfileDistricts } from "@/components/ProfileDistricts";
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti";

type IdType = "passport" | "drivers_license" | "medical_card" | null;
type IdCaptureMethod = "upload" | "camera" | null;

const ID_TYPE_LABELS: Record<Exclude<IdType, null>, string> = {
	passport: "Canadian Passport",
	drivers_license: "Quebec Driver's License",
	medical_card: "Quebec Medical Card (RAMQ)",
};

interface FormInputProps extends React.ComponentProps<typeof ShadcnInput> {
	label: string;
	error?: string;
}

const Input = React.forwardRef<HTMLInputElement, FormInputProps>(
	({ label, error, ...props }, ref) => (
		<div className="flex flex-col gap-1">
			<label className="font-medium text-sm mb-1">{label}</label>
			<ShadcnInput ref={ref} aria-invalid={!!error} {...props} />
			{error && <span className="text-xs text-destructive mt-1">{error}</span>}
		</div>
	)
);
Input.displayName = "Input";

const formatName = (s: string | null | undefined) =>
	(s ?? "")
		.toLowerCase()
		.trim()
		.replace(/[\p{L}\p{M}]+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));

type SignUpFormValues = {
	email: string;
	password?: string;
	confirmPassword?: string;
	firstName?: string;
	lastName?: string;
	selfie?: File | null;
	idPhoto?: File | null;
};

const createSignUpSchema = (isUpgrade: boolean) =>
	z
		.object({
			email: z.string().email(),
			password: isUpgrade ? z.string().optional() : z.string().min(6),
			confirmPassword: isUpgrade
				? z.string().optional()
				: z.string().min(6, "Please confirm your password"),
			firstName: z.string().optional(),
			lastName: z.string().optional(),
			selfie: z.instanceof(File).optional().nullable(),
			idPhoto: z.instanceof(File).optional().nullable(),
		})
		.superRefine((data, ctx) => {
			if (isUpgrade) return;
			if (data.password !== data.confirmPassword) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Passwords do not match",
					path: ["confirmPassword"],
				});
			}
		});

function VerifiedSignUpPageContent() {
	const [step, setStep] = useState(1);
	const [passwordsMatch, setPasswordsMatch] = useState(false);
	const [selfieFile, setSelfieFile] = useState<File | null>(null);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
	const [idType, setIdType] = useState<IdType>(null);
	const [idCaptureMethod, setIdCaptureMethod] = useState<IdCaptureMethod>(null);
	const [manualAddress, setManualAddress] = useState({
		street: "",
		city: "",
		postalCode: "",
	});
	const [verificationStep, setVerificationStep] = useState<
		"form" | "verification" | "complete"
	>("form");
	const [verificationError, setVerificationError] = useState<string | null>(
		null
	);
	const [emailExists, setEmailExists] = useState(false);
	const [checkingEmail, setCheckingEmail] = useState(false);
	const [ocrData, setOcrData] = useState<{
		first_name: string | null;
		last_name: string | null;
		address: string | null;
		address_line1?: string | null;
		address_city?: string | null;
		address_postal?: string | null;
	} | null>(null);
	const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
	const confettiRef = useRef<ConfettiRef>(null);

	const { user, setSession } = useAuth();
	const supabase = createClient();
	const router = useRouter();
	const searchParams = useSearchParams();
	const isUpgrade = searchParams.get("mode") === "upgrade";
	const returnToParam = searchParams.get("returnTo");
	const returnTo =
		returnToParam && returnToParam.startsWith("/") ? returnToParam : "/";
	const schema = React.useMemo(
		() => createSignUpSchema(isUpgrade),
		[isUpgrade]
	);

	React.useEffect(() => {
		if (step === 6 && confettiRef.current) {
			confettiRef.current.fire({
				particleCount: 100,
				spread: 70,
				origin: { y: 0.6 },
			});
		}
	}, [step]);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting, isValid },
		setError,
		reset,
		watch,
		setValue,
	} = useForm<SignUpFormValues>({
		resolver: zodResolver(schema),
		mode: "onChange",
		defaultValues: {
			email: user?.email ?? "",
		},
	});

	const password = watch("password");
	const confirmPassword = watch("confirmPassword");
	const email = watch("email");

	React.useEffect(() => {
		if (isUpgrade && user?.email) {
			setValue("email", user.email, { shouldValidate: true });
		}
	}, [isUpgrade, setValue, user?.email]);

	React.useEffect(() => {
		setPasswordsMatch(
			!!password && !!confirmPassword && password === confirmPassword
		);
	}, [password, confirmPassword]);

	// Debounced email validation
	React.useEffect(() => {
		if (isUpgrade) {
			setEmailExists(false);
			setCheckingEmail(false);
			return;
		}
		if (!email || !email.includes("@")) {
			setEmailExists(false);
			return;
		}

		const timeoutId = setTimeout(async () => {
			setCheckingEmail(true);
			try {
				const response = await fetch("/api/auth/check-email", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email }),
				});
				const data = await response.json();
				setEmailExists(data.exists || false);
			} catch (error) {
				console.error("Error checking email:", error);
				setEmailExists(false);
			} finally {
				setCheckingEmail(false);
			}
		}, 500); // 500ms debounce

		return () => clearTimeout(timeoutId);
	}, [email]);

	const onSubmit = async (data: SignUpFormValues) => {
		if (isUpgrade && !user?.id) {
			toast.error("Please log in to upgrade your account");
			return;
		}

		// Step 1: Validate images and ID type are set
		if (!selfieFile || !idPhotoFile || !idType) {
			toast.error(
				"Please select an ID type and upload both a selfie and your ID photo"
			);
			return;
		}

		// Validate manual address for passport/medical_card
		const requiresManualAddress =
			idType === "passport" || idType === "medical_card";
		if (
			requiresManualAddress &&
			(!manualAddress.street ||
				!manualAddress.city ||
				!manualAddress.postalCode)
		) {
			toast.error("Please enter your complete address");
			return;
		}

		setVerificationStep("verification");
		setVerificationError(null);

		// Step 2: Submit to verification API
		const formData = new FormData();
		formData.append("email", data.email);
		formData.append("selfie", selfieFile);
		formData.append("idPhoto", idPhotoFile);
		formData.append("idType", idType);

		// Include manual address for passport/medical_card
		if (requiresManualAddress) {
			formData.append(
				"manualAddress",
				JSON.stringify({
					street: manualAddress.street,
					city: manualAddress.city,
					postalCode: manualAddress.postalCode,
				})
			);
		}

		try {
			const verificationResponse = await fetch("/api/verification/start", {
				method: "POST",
				body: formData,
			});

			const verificationResult = await verificationResponse.json();

			if (!verificationResponse.ok || !verificationResult.verified) {
				setVerificationError(
					verificationResult.reason ||
						verificationResult.error ||
						"Verification failed"
				);
				setVerificationStep("form");
				toast.error(
					`Verification failed: ${
						verificationResult.reason || "Please try again"
					}`
				);
				return;
			}

			// Extract OCR data from verification result
			const ocr = verificationResult.ocr_data;
			if (!ocr?.detected || !ocr.first_name || !ocr.last_name) {
				setVerificationError(
					"Could not read your ID card. Please ensure the image is clear and try again."
				);
				setVerificationStep("form");
				toast.error("Could not read ID information");
				return;
			}

			// Store OCR data for display
			setOcrData({
				first_name: ocr.first_name,
				last_name: ocr.last_name,
				address: ocr.address,
				address_line1: ocr.address_line1,
				address_city: ocr.address_city,
				address_postal: ocr.address_postal,
			});

			// Step 3: Verification passed
			const firstNameFormatted = formatName(ocr.first_name);
			const lastNameFormatted = formatName(ocr.last_name);
			const generatedUsername =
				`${firstNameFormatted} ${lastNameFormatted.charAt(0)}`.trim();
			if (isUpgrade) {
				const userId = user?.id;
				if (!userId) {
					setError("email", { message: "No authenticated user found." });
					setVerificationStep("form");
					return;
				}

				const { data: existingProfile, error: existingProfileError } =
					await supabase
						.from("profiles")
						.select("username, type")
						.eq("id", userId)
						.single();

				if (existingProfileError) {
					console.error(
						"[Upgrade] Failed to load current profile",
						existingProfileError
					);
					setError("email", {
						message: "Could not load your current profile. Please try again.",
					});
					setVerificationStep("form");
					return;
				}

				if (existingProfile?.type === "Resident") {
					toast.success("Your account is already verified.");
					router.push(returnTo);
					return;
				}

				const nextUsername = existingProfile?.username || generatedUsername;
				const { error: profileError } = await supabase
					.from("profiles")
					.update({
						username: nextUsername,
						first_name: firstNameFormatted,
						last_name: lastNameFormatted,
						coord: ocr.address_coord,
						type: "Resident",
						verified: true,
						verification_attempt_id: verificationResult.attemptId,
					})
					.eq("id", userId);

				if (profileError) {
					console.error("[Upgrade] Profile update error", profileError);
					setError("email", { message: profileError.message });
					setVerificationStep("form");
					return;
				}
				setVerifiedUserId(userId);
			} else {
				const { error, data: sessionData } = await supabase.auth.signUp({
					email: data.email,
					password: data.password as string,
					options: {
						data: {
							first_name: firstNameFormatted,
							last_name: lastNameFormatted,
							username: generatedUsername,
						},
					},
				});

				if (error) {
					console.error("[SignUp] Supabase signUp error", error);
					setError("email", { message: error.message });
					setVerificationStep("form");
					return;
				}

				const userId = sessionData?.user?.id;
				if (!userId) {
					setError("email", { message: "No user id returned from sign up." });
					setVerificationStep("form");
					return;
				}

				// Note: address is NOT stored - PII. Only coordinates are saved.
				const { error: profileError } = await supabase.from("profiles").insert({
					id: userId,
					username: generatedUsername,
					first_name: firstNameFormatted,
					last_name: lastNameFormatted,
					coord: ocr.address_coord,
					type: "Resident",
					verified: true,
					verification_attempt_id: verificationResult.attemptId,
				});

				if (profileError) {
					console.error("[SignUp] Profile creation error", profileError);
					setError("firstName", { message: profileError.message });
					setVerificationStep("form");
					return;
				}

				setSession(sessionData.session);
				setVerifiedUserId(userId);
			}

			// Fire-and-forget cleanup of uploaded verification images
			try {
				const cleanupResponse = await fetch("/api/verification/cleanup", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ attemptId: verificationResult.attemptId }),
				});

				if (!cleanupResponse.ok) {
					const cleanupResult = await cleanupResponse.json().catch(() => null);
					console.error("[Verification] Cleanup failed", cleanupResult);
					toast.error(
						"Verification completed, but we could not delete verification photos. Please contact support."
					);
				}
			} catch (cleanupError) {
				console.error("[Verification] Cleanup request error", cleanupError);
				toast.error(
					"Verification completed, but we could not delete verification photos. Please contact support."
				);
			}

			setVerificationStep("complete");
			reset();
			toast.success(
				isUpgrade
					? "Identity verified! Account upgraded 🎉"
					: "Identity verified! Account created 🎉"
			);
			setStep(6);
		} catch (error) {
			console.error("[SignUp] Verification error:", error);
			setVerificationError("An unexpected error occurred");
			setVerificationStep("form");
			toast.error("Verification failed. Please try again.");
		}
	};

	const renderStep = () => {
		switch (step) {
			case 1:
				return (
					<div className="flex flex-col items-center text-center space-y-6">
						<div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center">
							<Shield className="w-10 h-10 text-white" />
						</div>
						<h1 className="text-3xl font-bold text-gray-900">
							Why Become a Verified Resident?
						</h1>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 w-full max-w-3xl">
							<div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
								<Bot className="w-8 h-8 text-primary mb-3 mx-auto" />
								<h3 className="font-semibold mb-2">No Bots</h3>
								<p className="text-sm text-gray-600">
									Keep automated accounts out of our community
								</p>
							</div>
							<div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
								<Shield className="w-8 h-8 text-primary mb-3 mx-auto" />
								<h3 className="font-semibold mb-2">Safe Discussions</h3>
								<p className="text-sm text-gray-600">
									Real, verified people. No bots, fewer trolls, more authentic
									conversations.
								</p>
							</div>
							<div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
								<UserCheck className="w-8 h-8 text-primary mb-3 mx-auto" />
								<h3 className="font-semibold mb-2">Local Voices</h3>
								<p className="text-sm text-gray-600">
									Discuss real issues, close to you, with real neighbours.
								</p>
							</div>
						</div>
						<Button
							onClick={() => setStep(2)}
							size="lg"
							className="mt-8 px-8 py-6 text-lg"
						>
							Continue
						</Button>
						<p className="text-lg text-gray-600 max-w-2xl leading-relaxed">
							Not Sure? Learn more about us{" "}
							<Link className="text-primary hover:underline" href="/learn-more">
								here
							</Link>
						</p>
					</div>
				);

			case 2:
				return (
					<div className="flex flex-col items-center text-center space-y-6">
						<div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
							<Camera className="w-10 h-10 text-green-600" />
						</div>
						<h1 className="text-3xl font-bold text-gray-900">
							Your Privacy Matters
						</h1>
						<p className="text-lg text-gray-600 max-w-2xl leading-relaxed">
							In order to perform verification, we ask for a{" "}
							<strong>selfie</strong> and <strong>photo ID</strong>. We inform
							you that after verification,{" "}
							<strong>all material is deleted immediately</strong>.
						</p>
						<div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl">
							<h3 className="font-semibold text-blue-900 mb-3 flex items-center justify-center gap-2">
								<Lock className="w-5 h-5" />
								Our Privacy Commitment
							</h3>
							<ul className="text-left space-y-2 text-gray-700">
								<li className="flex items-start gap-2">
									<CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
									<span>Your photos are processed securely and encrypted</span>
								</li>
								<li className="flex items-start gap-2">
									<CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
									<span>
										All verification materials are deleted immediately after
										processing
									</span>
								</li>
								<li className="flex items-start gap-2">
									<CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
									<span>
										We only verify your identity and Montreal residency
									</span>
								</li>
								<li className="flex items-start gap-2">
									<CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
									<span>No data is shared with third parties</span>
								</li>
							</ul>
						</div>
						<div className="flex gap-4 mt-8">
							<Button
								onClick={() => setStep(1)}
								variant="outline"
								size="lg"
								className="px-8 py-6 text-lg"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back
							</Button>
							<Button
								onClick={() => setStep(3)}
								size="lg"
								className="px-8 py-6 text-lg"
							>
								I Understand
							</Button>
						</div>
					</div>
				);

			case 3:
				return (
					<div className="max-w-md mx-auto space-y-6">
						<div className="text-center mb-8">
							<h1 className="text-3xl font-bold text-gray-900 mb-2">
								{isUpgrade
									? "Upgrade to Verified Resident"
									: "Create Your Account"}
							</h1>
							<p className="text-gray-600">
								{isUpgrade
									? "Confirm your email to start verification"
									: "Set up your login credentials"}
							</p>
						</div>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								setStep(4);
							}}
							className="space-y-4"
						>
							<div className="space-y-1">
								<Input
									label="Email"
									type="email"
									{...register("email")}
									disabled={isUpgrade}
									error={
										errors.email?.message ||
										(!isUpgrade && emailExists
											? "Email already exists"
											: undefined)
									}
									autoComplete="email"
								/>
								{!isUpgrade &&
									checkingEmail &&
									email &&
									email.includes("@") && (
										<span className="text-xs text-gray-500 flex items-center gap-1">
											Checking availability...
										</span>
									)}
								{!isUpgrade &&
									!checkingEmail &&
									email &&
									email.includes("@") &&
									!emailExists &&
									!errors.email && (
										<span className="text-xs text-green-600 flex items-center gap-1">
											✅ Email available
										</span>
									)}
							</div>
							{!isUpgrade && (
								<>
									<Input
										label="Password"
										type="password"
										{...register("password")}
										error={errors.password?.message}
										autoComplete="new-password"
									/>
									<Input
										label="Confirm Password"
										type="password"
										{...register("confirmPassword")}
										error={errors.confirmPassword?.message}
										autoComplete="new-password"
									/>
									{confirmPassword && passwordsMatch && (
										<span className="flex items-center gap-1 text-green-600 text-sm font-medium">
											✅ Passwords match
										</span>
									)}
								</>
							)}
							<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
								<p className="text-sm text-blue-900">
									<strong>What&apos;s next?</strong> We&apos;ll verify your
									identity using your ID card. Your name and address will be
									automatically extracted from your ID - no manual entry needed!
								</p>
							</div>
							<div className="flex gap-4 pt-4">
								<Button
									type="button"
									onClick={() => setStep(2)}
									variant="outline"
									size="lg"
									className="flex-1"
								>
									<ArrowLeft className="w-4 h-4 mr-2" />
									Back
								</Button>
								<Button
									type="submit"
									size="lg"
									className="flex-1"
									disabled={
										(!isUpgrade && !passwordsMatch) ||
										!watch("email") ||
										(!isUpgrade && emailExists) ||
										(!isUpgrade && checkingEmail)
									}
								>
									Continue
								</Button>
							</div>
						</form>
					</div>
				);

			case 4:
				return (
					<div className="max-w-lg mx-auto space-y-6">
						<div className="text-center mb-8">
							<h1 className="text-3xl font-bold text-gray-900 mb-2">
								Choose Your ID Type
							</h1>
							<p className="text-gray-600">
								Select the type of ID you&apos;d like to use for verification
							</p>
						</div>

						{/* Step 1a: ID Type Selection */}
						<div className="space-y-3">
							<label className="font-medium text-sm">Select ID Type</label>
							<div className="grid gap-3">
								{(
									[
										{
											value: "passport",
											icon: "🛂",
											label: "Canadian Passport",
										},
										{
											value: "drivers_license",
											icon: "🪪",
											label: "Quebec Driver's License",
										},
										{
											value: "medical_card",
											icon: "💳",
											label: "Quebec Medical Card (RAMQ)",
										},
									] as const
								).map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => {
											setIdType(option.value);
											setIdCaptureMethod(null);
											setIdPhotoFile(null);
											setManualAddress({
												street: "",
												city: "",
												postalCode: "",
											});
										}}
										className={`p-4 rounded-lg border-2 text-left transition-all flex items-center gap-4 ${
											idType === option.value
												? "border-primary bg-primary/5"
												: "border-gray-200 hover:border-gray-300"
										}`}
									>
										<span className="text-3xl">{option.icon}</span>
										<div className="flex-1">
											<p className="font-semibold text-gray-900">
												{option.label}
											</p>
										</div>
										{idType === option.value && (
											<CheckCircle2 className="w-5 h-5 text-primary" />
										)}
									</button>
								))}
							</div>
						</div>

						{/* Step 1b: Capture Method Selection (shown after ID type is selected) */}
						{idType && (
							<div className="space-y-3 pt-4 border-t">
								<label className="font-medium text-sm">
									How would you like to provide your {ID_TYPE_LABELS[idType]}?
								</label>
								<div className="grid grid-cols-2 gap-3 mt-2">
									<button
										type="button"
										onClick={() => {
											setIdCaptureMethod("upload");
											setIdPhotoFile(null);
										}}
										className={`p-4 rounded-lg border-2 text-center transition-all flex flex-col items-center gap-2 ${
											idCaptureMethod === "upload"
												? "border-primary bg-primary/5"
												: "border-gray-200 hover:border-gray-300"
										}`}
									>
										<Upload className="w-8 h-8 text-primary" />
										<span className="font-semibold">Upload Photo</span>
										<span className="text-xs text-gray-500">
											From your device
										</span>
									</button>
									<button
										type="button"
										onClick={() => {
											setIdCaptureMethod("camera");
											setIdPhotoFile(null);
										}}
										className={`p-4 rounded-lg border-2 text-center transition-all flex flex-col items-center gap-2 ${
											idCaptureMethod === "camera"
												? "border-primary bg-primary/5"
												: "border-gray-200 hover:border-gray-300"
										}`}
									>
										<Camera className="w-8 h-8 text-primary" />
										<span className="font-semibold">Take Photo</span>
										<span className="text-xs text-gray-500">
											Use your camera
										</span>
									</button>
								</div>
							</div>
						)}

						{/* Upload Input (shown when upload method selected) */}
						{idType && idCaptureMethod === "upload" && (
							<div className="space-y-3 pt-4">
								<Input
									type="file"
									accept="image/*"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) setIdPhotoFile(file);
									}}
									label={`Upload ${ID_TYPE_LABELS[idType]}`}
									className="block w-full text-sm text-gray-500 file:mr-4 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
								/>
								{idPhotoFile && (
									<span className="text-xs text-green-600 mt-1 flex items-center gap-1">
										✅ {idPhotoFile.name}
									</span>
								)}
							</div>
						)}

						{/* Camera Capture (shown when camera method selected) */}
						{idType && idCaptureMethod === "camera" && (
							<div className="space-y-3 pt-4">
								<label className="font-medium text-sm">
									Capture {ID_TYPE_LABELS[idType]}
								</label>
								<IdCapture
									onCapture={(file) => setIdPhotoFile(file)}
									idType={idType}
								/>
								{idPhotoFile && (
									<span className="text-xs text-green-600 mt-1 flex items-center gap-1">
										✅ ID photo captured
									</span>
								)}
							</div>
						)}

						{/* Tips */}
						{idType && idCaptureMethod && (
							<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
								<p className="text-sm text-blue-900">
									<strong>Tips for a clear photo:</strong>
								</p>
								<ul className="text-sm text-blue-900 mt-2 space-y-1 list-disc list-inside">
									<li>Ensure all text is readable</li>
									<li>Avoid glare and shadows</li>
									<li>
										Capture the entire{" "}
										{idType === "passport" ? "photo page" : "card"}
									</li>
								</ul>
							</div>
						)}

						{/* Manual Address Input (required for Passport and Medical Card) */}
						{idType &&
							(idType === "passport" || idType === "medical_card") &&
							idPhotoFile && (
								<div className="space-y-4 pt-4 border-t">
									<div>
										<label className="font-medium text-sm">Your Address</label>
										<p className="text-xs text-gray-500 mt-1">
											{idType === "passport"
												? "Passports don't contain address information. Please enter your Quebec address."
												: "Please confirm your address for verification."}
										</p>
									</div>
									<Input
										label="Street Address"
										placeholder="123 Rue Example"
										value={manualAddress.street}
										onChange={(e) =>
											setManualAddress((prev) => ({
												...prev,
												street: e.target.value,
											}))
										}
									/>
									<div className="grid grid-cols-2 gap-3">
										<Input
											label="City"
											placeholder="Montreal"
											value={manualAddress.city}
											onChange={(e) =>
												setManualAddress((prev) => ({
													...prev,
													city: e.target.value,
												}))
											}
										/>
										<Input
											label="Postal Code"
											placeholder="H2X 1Y4"
											value={manualAddress.postalCode}
											onChange={(e) =>
												setManualAddress((prev) => ({
													...prev,
													postalCode: e.target.value.toUpperCase(),
												}))
											}
										/>
									</div>
								</div>
							)}

						{/* Navigation */}
						<div className="flex gap-4 pt-4">
							<Button
								type="button"
								onClick={() => setStep(3)}
								variant="outline"
								size="lg"
								className="flex-1"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back
							</Button>
							<Button
								type="button"
								onClick={() => setStep(5)}
								size="lg"
								className="flex-1"
								disabled={
									!idPhotoFile ||
									!idType ||
									((idType === "passport" || idType === "medical_card") &&
										(!manualAddress.street ||
											!manualAddress.city ||
											!manualAddress.postalCode))
								}
							>
								Continue
							</Button>
						</div>
					</div>
				);

			case 5:
				return (
					<div className="max-w-md mx-auto space-y-6">
						<div className="text-center mb-8">
							<h1 className="text-3xl font-bold text-gray-900 mb-2">
								Verify Your Identity
							</h1>
							<p className="text-gray-600">
								Take a selfie to confirm your identity
							</p>
						</div>
						<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
							<div>
								<div className="flex flex-col gap-1">
									<label className="font-medium text-sm mb-1">Selfie</label>
									<LivenessCapture
										onCapture={(file) => {
											setSelfieFile(file);
											setCameraError(null);
										}}
										onError={(msg) => setCameraError(msg)}
									/>
								</div>
								{selfieFile && (
									<span className="text-xs text-green-600 mt-1 flex items-center gap-1">
										✅ Selfie captured
									</span>
								)}
								{cameraError && (
									<div className="text-xs text-destructive mt-2 p-2 bg-destructive/10 rounded">
										{cameraError}
									</div>
								)}
							</div>

							{verificationError && (
								<div className="text-xs text-destructive mt-2 p-2 bg-destructive/10 rounded">
									{verificationError}
								</div>
							)}

							<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
								<p className="text-sm text-blue-900">
									<strong>What happens next?</strong> We&apos;ll verify that
									your selfie matches your ID photo. This helps ensure the
									security of our community.
								</p>
							</div>

							<div className="flex gap-4 pt-4">
								<Button
									type="button"
									onClick={() => setStep(4)}
									variant="outline"
									size="lg"
									className="flex-1"
									disabled={verificationStep === "verification"}
								>
									<ArrowLeft className="w-4 h-4 mr-2" />
									Back
								</Button>
								<Button
									type="submit"
									size="lg"
									className="flex-1"
									disabled={
										isSubmitting ||
										!isValid ||
										(!isUpgrade && !passwordsMatch) ||
										!selfieFile ||
										!idPhotoFile ||
										verificationStep === "verification"
									}
								>
									{verificationStep === "verification"
										? "Verifying..."
										: isUpgrade
										? "Verify & Upgrade"
										: "Verify & Sign Up"}
								</Button>
							</div>
						</form>
					</div>
				);

			case 6:
				// Success state with identity card
				return (
					<div className="bg-background relative flex flex-col items-center text-center space-y-8 animate-in fade-in duration-700 min-h-screen">
						<Confetti
							ref={confettiRef}
							className="absolute top-0 left-0 z-0 size-full"
							manualstart
						/>
						<div className="flex flex-col items-center space-y-4 relative z-10">
							<div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
								<CheckCircle2 className="w-12 h-12 text-green-600" />
							</div>
							<h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
								Verification Successful!
							</h1>
							<p className="text-xl text-gray-600 max-w-2xl">
								Welcome to Vox.Vote! Your identity has been verified and your
								voice counts.
							</p>
						</div>

						<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-5xl px-4 relative z-10">
							{/* Left Column: Identity Card & Privacy */}
							<div className="flex flex-col gap-6 items-center lg:items-end">
								{/* Identity Card */}
								{ocrData && (
									<div className="bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-2xl p-8 max-w-md w-full text-white relative overflow-hidden transform hover:scale-105 transition-transform duration-300">
										<div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
										<div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12" />

										<div className="relative z-10">
											<div className="flex items-center justify-between mb-6">
												<h2 className="text-xl font-bold">Verified Resident</h2>
												<BadgeCheck className="w-8 h-8" />
											</div>

											<div className="space-y-4 text-left">
												<div>
													<p className="text-white/70 text-sm">Name</p>
													<p className="text-2xl font-bold">
														{ocrData.first_name}{" "}
														{ocrData.last_name?.charAt(0)}.
													</p>
												</div>

												<div>
													<p className="text-white/70 text-sm">Status</p>
													<div className="flex items-center gap-2">
														<div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
														<p className="text-lg font-semibold">Verified</p>
													</div>
												</div>
											</div>
										</div>
									</div>
								)}

								{/* Privacy Disclosure */}
								<div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-md w-full text-left">
									<h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
										<Lock className="w-4 h-4" />
										Privacy Verified
									</h3>
									<ul className="space-y-2 text-gray-700 text-sm">
										<li className="flex items-start gap-2">
											<CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
											<span>
												Only your first name and last initial are visible
											</span>
										</li>
										<li className="flex items-start gap-2">
											<CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
											<span>Your exact address is never shared</span>
										</li>
										<li className="flex items-start gap-2">
											<CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
											<span>Verification photos permanently deleted</span>
										</li>
									</ul>
								</div>
							</div>

							{/* Right Column: Districts & Officials */}
							<div className="flex flex-col gap-6 items-center lg:items-start w-full">
								{verifiedUserId && (
									<div className="w-full max-w-md animate-in slide-in-from-right-8 duration-700 delay-300">
										<div className="mb-4 text-left">
											<h3 className="text-xl font-bold text-gray-900 mb-1">
												Your Elected Officials
											</h3>
											<p className="text-gray-600 text-sm">
												We&apos;ve automatically identified your local
												representatives based on your address.
											</p>
										</div>
										<ProfileDistricts
											profileId={verifiedUserId}
											className="border-0 shadow-xl bg-white/50 backdrop-blur-sm"
										/>
									</div>
								)}
							</div>
						</div>

						<Button
							onClick={() => router.push(returnTo)}
							size="lg"
							className="mt-8 px-12 py-6 text-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 relative z-10"
						>
							Enter Community
						</Button>
					</div>
				);

			default:
				return null;
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-white to-gray-100">
			{/* Header */}
			<header className="sticky top-0 z-50 w-full bg-white shadow-sm">
				<div className="container mx-auto flex items-center justify-between h-16 px-4">
					<Link href="/" className="flex items-center gap-2">
						<Image
							src="/vox-vote-logo.png"
							alt="vox-vote-logo"
							width={80}
							height={32}
						/>
					</Link>
					<Link href={isUpgrade ? returnTo : "/signup"}>
						<Button
							variant="outline"
							className="text-primary rounded-full border-primary hover:bg-primary/10"
						>
							<ArrowLeft className="w-4 h-4" />
							Back
						</Button>
					</Link>
				</div>
			</header>

			{/* Progress Indicator */}
			{step < 6 && (
				<div className="container mx-auto px-4 pt-8">
					<div className="max-w-3xl mx-auto">
						<div className="flex items-center justify-between mb-2">
							{[1, 2, 3, 4, 5].map((s) => (
								<div
									key={s}
									className={`flex-1 h-2 rounded-full mx-1 transition-colors ${
										s <= step ? "bg-primary" : "bg-gray-200"
									}`}
								/>
							))}
						</div>
						<p className="text-center text-sm text-gray-600">
							Step {step} of 5
						</p>
					</div>
				</div>
			)}

			{/* Main Content */}
			<main className="container mx-auto px-4 py-12">
				<div className="max-w-4xl mx-auto">{renderStep()}</div>
			</main>

			{/* Verification Loading Modal */}
			<Dialog open={verificationStep === "verification"}>
				<DialogContent showCloseButton={false} className="sm:max-w-md">
					<DialogHeader className="text-center sm:text-center">
						<div className="flex justify-center mb-4">
							<div className="relative">
								<div className="w-20 h-20 rounded-full border-4 border-primary/20 flex items-center justify-center">
									<Loader2 className="w-10 h-10 text-primary animate-spin" />
								</div>
							</div>
						</div>
						<DialogTitle className="text-xl">
							Verifying Your Identity
						</DialogTitle>
						<DialogDescription className="text-center">
							Please wait while we verify your information...
						</DialogDescription>
					</DialogHeader>
					<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-2">
						<p className="text-sm text-blue-900 text-center">
							We&apos;re reading your ID card and matching your photos. This
							usually takes just a few seconds.
						</p>
					</div>
					<div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
						<p className="text-xs text-amber-800 text-center font-medium">
							⚠️ Please do not navigate away from this page
						</p>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default function VerifiedSignUpPage() {
	return (
		<Suspense>
			<VerifiedSignUpPageContent />
		</Suspense>
	);
}
