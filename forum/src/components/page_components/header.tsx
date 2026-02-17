"use client";
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { AuthModal } from "@/components/auth/AuthModal";
import Link from "next/link";
import Image from "next/image";
import { MobileMenu } from "./MobileMenu";
import { IssueForm } from "../IssueForm";
import { User, Shield } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { motion, MotionValue, useMotionTemplate } from "framer-motion";

interface HeaderProps {
	logoRef?: React.RefObject<HTMLDivElement | null>;
	logoOpacity?: number | MotionValue<number>;
	headerOpacity?: number | MotionValue<number>;
}

const Header: React.FC<HeaderProps> = ({
	logoRef,
	logoOpacity = 1,
	headerOpacity = 1,
}) => {
	const { user, profile, signOut } = useAuth();
	const [modalOpen, setModalOpen] = useState(false);
	const avatarUrl = profile?.avatar_url ?? null;
	const profileType = profile?.type ?? null;

	return (
		<motion.header
			className="sticky top-0 z-40 w-full bg-white border-b"
			style={{
				borderColor: useMotionTemplate`rgba(229, 231, 235, ${headerOpacity})`,
			}}
		>
			<div className="container mx-auto flex items-center justify-between h-16 px-4">
				{/* Logo */}
				<motion.div ref={logoRef} style={{ opacity: logoOpacity }}>
					<Link href="/" className="flex items-center gap-2">
						<Image
							src="/vox-vote-logo.png"
							alt="vox-vote-logo"
							width={80}
							height={32}
						/>
					</Link>
				</motion.div>

				{/* Right side - Avatar with badge and hamburger */}
				{user ? (
					<div className="flex items-center gap-1 sm:gap-2">
						{profileType === "Member" && (
							<Link
								href={`/signup/verified?mode=upgrade&returnTo=${encodeURIComponent(
									`/profile/${user.id}`
								)}`}
							>
								<Button
									variant="outline"
									size="sm"
									className="hidden sm:flex text-primary border-primary hover:bg-primary/10"
								>
									Upgrade to Resident
								</Button>
							</Link>
						)}
						{profileType === "Admin" && (
							<Link href="/admin">
								<Button variant="ghost" className="p-2" title="Admin Panel">
									<Shield className="w-5 h-5 text-red-600" />
								</Button>
							</Link>
						)}
						<div className="flex items-center gap-1 sm:gap-2">
							<Dialog>
								<DialogTrigger asChild>
									<Button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-4 py-2 text-sm font-medium">
										+ Post
									</Button>
								</DialogTrigger>
								<DialogContent className="max-h-[75vh] overflow-y-auto">
									<DialogHeader>
										<DialogTitle>New Post</DialogTitle>
									</DialogHeader>
									<IssueForm />
								</DialogContent>
							</Dialog>
						</div>
						<NotificationBell />
						<Link href="/leaderboard">
							<Button variant="ghost" className="p-2">
								<Image
									src="/Leaderboards.png"
									alt="Leaderboard"
									width={24}
									height={24}
								/>
							</Button>
						</Link>
						{/* Avatar */}
						<Link href={`/profile/${user?.id}`}>
							<Avatar className="w-10 h-10">
								<AvatarImage
									src={avatarUrl || undefined}
									alt={user.user_metadata?.full_name || user.email}
								/>
								<AvatarFallback className="bg-gray-200">
									<User className="w-5 h-5 text-gray-500" />
								</AvatarFallback>
							</Avatar>
						</Link>
						{/* Hamburger menu */}
						<MobileMenu
							user={user}
							signOut={signOut}
							profileType={profileType}
						/>
					</div>
				) : (
					<div className="flex items-end gap-2">
						<Button
							variant="default"
							className="rounded-lg"
							onClick={() => setModalOpen(true)}
						>
							Log In
						</Button>

						<AuthModal open={modalOpen} onOpenChange={setModalOpen} />

						<Link href="/signup">
							<Button variant="outline" className="rounded-lg">
								Sign up
							</Button>
						</Link>

						{/* Hamburger menu */}
						<MobileMenu setModalOpen={setModalOpen} />
					</div>
				)}
			</div>
		</motion.header>
	);
};

export { Header };
