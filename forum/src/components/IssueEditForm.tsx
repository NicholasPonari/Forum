"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { TOPIC_IDS, TOPICS } from "@/lib/topics";
import { Loader2 } from "lucide-react";
import { DetailedIssue } from "@/lib/types/db";

const editSchema = z.object({
	type: z.enum(["Idea", "Problem", "Question"], {
		invalid_type_error: "Type is required",
		required_error: "Type is required",
	}),
	topic: z.enum(TOPIC_IDS as [string, ...string[]], {
		invalid_type_error: "Topic is required",
		required_error: "Topic is required",
	}),
	title: z.string().min(3, "Title is required"),
	narrative: z.string().min(3, "Narrative is required"),
});

type EditFormValues = z.infer<typeof editSchema>;

const TOPIC_OPTIONS = TOPIC_IDS.map((id) => ({
	value: id,
	label: TOPICS[id].label,
}));

interface IssueEditFormProps {
	issue: DetailedIssue;
	onSuccess?: () => void;
}

export function IssueEditForm({ issue, onSuccess }: IssueEditFormProps) {
	const { user, loading } = useAuth();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		setValue,
		watch,
		formState: { errors },
	} = useForm<EditFormValues>({
		resolver: zodResolver(editSchema),
		defaultValues: {
			type: (issue.type as "Idea" | "Problem" | "Question") || "Problem",
			topic: issue.topic || "general",
			title: issue.title || "",
			narrative: issue.narrative || "",
		},
	});

	const type = watch("type");
	const topic = watch("topic");

	const onSubmit = async (values: EditFormValues) => {
		if (!user) {
			setError("You must be logged in to edit.");
			return;
		}
		if (user.id !== issue.user_id) {
			setError("You can only edit your own posts.");
			return;
		}

		setSubmitting(true);
		setError(null);
		const supabase = createClient();

		const { error: updateError } = await supabase
			.from("issues")
			.update({
				type: values.type,
				title: values.title,
				narrative: values.narrative,
				topic: values.topic,
			})
			.eq("id", issue.id)
			.eq("user_id", user.id);

		if (updateError) {
			setError("Could not update post");
			setSubmitting(false);
			return;
		}

		// Record update on blockchain
		try {
			fetch("/api/blockchain/record-content", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contentId: issue.id.toString(), // Ensure string
					contentType: "issue",
				}),
			})
				.then(async (res) => {
					if (!res.ok) {
						let payload: any = null;
						try {
							payload = await res.json();
						} catch {
							payload = null;
						}
						console.error("Failed to record edit on chain:", {
							status: res.status,
							payload,
						});
					}
				})
				.catch((err) => console.error("Failed to record edit on chain:", err));
		} catch (e) {
			console.error("Blockchain recording error:", e);
		}

		setSubmitting(false);
		toast.success("Post updated successfully!");
		if (onSuccess) onSuccess();
	};

	return (
		<Card className="border-none shadow-none p-0">
			<CardContent className="p-0">
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label
								htmlFor="edit-type-select"
								className="text-xs font-medium text-muted-foreground"
							>
								Type
							</Label>
							<Select
								value={type}
								onValueChange={(v) =>
									setValue("type", v as EditFormValues["type"], {
										shouldValidate: true,
									})
								}
								disabled={submitting || !user || loading}
								name="type"
							>
								<SelectTrigger
									id="edit-type-select"
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
								htmlFor="edit-topic-select"
								className="text-xs font-medium text-muted-foreground"
							>
								Topic
							</Label>
							<Select
								value={topic}
								onValueChange={(v) =>
									setValue("topic", v as EditFormValues["topic"], {
										shouldValidate: true,
									})
								}
								disabled={submitting || !user || loading}
								name="topic"
							>
								<SelectTrigger
									id="edit-topic-select"
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

					<div className="space-y-1.5">
						<Label
							htmlFor="edit-title"
							className="text-xs font-medium text-muted-foreground"
						>
							Title
						</Label>
						<Input
							id="edit-title"
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
						<Label
							htmlFor="edit-narrative"
							className="text-xs font-medium text-muted-foreground"
						>
							Description
						</Label>
						<Textarea
							id="edit-narrative"
							placeholder="Describe the issue in detail..."
							{...register("narrative")}
							disabled={submitting || !user || loading}
							aria-invalid={!!errors.narrative}
							className="min-h-[150px] resize-none text-sm"
						/>
						{errors.narrative && (
							<p className="text-destructive text-[10px]">
								{errors.narrative.message}
							</p>
						)}
					</div>

					<p className="text-xs text-muted-foreground">
						Note: Media and location cannot be changed after posting.
					</p>

					{error && (
						<div className="p-2 text-xs text-destructive bg-destructive/10 rounded-md">
							{error}
						</div>
					)}

					<Button
						type="submit"
						className="w-full"
						disabled={submitting || !user || loading}
					>
						{submitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save Changes"
						)}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
