"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { PiShareFat } from "react-icons/pi";
import { FaFacebook, FaInstagram } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { Link2, Check } from "lucide-react";
import { Issue } from "@/lib/types/db";
import { useTranslation } from "@/hooks/use-translation";

interface ShareDialogProps {
	issue: Issue;
}

export function ShareDialog({ issue }: ShareDialogProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	// Construct the full URL for the post
	const postUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/${issue.id}`
			: "";

	// Share text for social media
	const shareText = t.share.shareText.replace("{title}", issue.title);

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(postUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	const handleFacebookShare = () => {
		const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
			postUrl
		)}`;
		window.open(facebookUrl, "_blank", "width=600,height=400");
		setOpen(false);
	};

	const handleTwitterShare = () => {
		const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
			shareText
		)}&url=${encodeURIComponent(postUrl)}`;
		window.open(twitterUrl, "_blank", "width=600,height=400");
		setOpen(false);
	};

	const handleInstagramShare = async () => {
		// Instagram doesn't support direct web sharing
		// Copy the link and show a message
		await handleCopyLink();
		alert(
			t.share.instagramAlert
		);
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-auto px-3 py-2 rounded-3xl text-black bg-gray-100 hover:bg-gray-200"
				>
					<PiShareFat className="w-4 h-4 mr-1" />
					{t.share.button}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t.share.title}</DialogTitle>
					<DialogDescription>
						{t.share.description}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-4">
					{/* Facebook Share */}
					<Button
						variant="outline"
						className="w-full justify-start gap-3 h-12"
						onClick={handleFacebookShare}
					>
						<FaFacebook className="w-5 h-5 text-blue-600" />
						<span>{t.share.facebook}</span>
					</Button>

					{/* Twitter/X Share */}
					<Button
						variant="outline"
						className="w-full justify-start gap-3 h-12"
						onClick={handleTwitterShare}
					>
						<FaXTwitter className="w-5 h-5 text-black" />
						<span>{t.share.twitter}</span>
					</Button>

					{/* Instagram Share */}
					<Button
						variant="outline"
						className="w-full justify-start gap-3 h-12"
						onClick={handleInstagramShare}
					>
						<FaInstagram className="w-5 h-5 text-pink-600" />
						<span>{t.share.instagram}</span>
					</Button>

					{/* Copy Link */}
					<Button
						variant="outline"
						className="w-full justify-start gap-3 h-12"
						onClick={handleCopyLink}
					>
						{copied ? (
							<Check className="w-5 h-5 text-green-600" />
						) : (
							<Link2 className="w-5 h-5 text-gray-600" />
						)}
						<span>{copied ? t.share.copied : t.share.copyLink}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
