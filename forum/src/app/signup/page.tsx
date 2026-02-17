"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
	ArrowLeft,
	BadgeCheck,
	Building2,
	Vote,
	MessageSquare,
	FileText,
	Users,
} from "lucide-react";

export default function SignUpPage() {
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
					<Link href="/">
						<Button
							variant="outline"
							className="text-primary rounded-full border-primary hover:bg-primary/10"
						>
							<ArrowLeft className="w-4 h-4" />
							Back to Home
						</Button>
					</Link>
				</div>
			</header>

			{/* Main Content */}
			<main className="container mx-auto px-4 py-12">
				<div className="max-w-4xl mx-auto">
					<div className="text-center mb-12">
						<h1 className="text-4xl font-bold text-gray-900 mb-4">
							Join Vox.Vote
						</h1>
						<p className="text-lg text-gray-600 max-w-2xl mx-auto">
							Choose how you&apos;d like to participate in your community.
							All accounts require identity verification.
						</p>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						{/* Verified Resident */}
						<div className="bg-white rounded-xl shadow-lg border-2 border-primary p-6 flex flex-col relative">
							<div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
								Recommended
							</div>
							<div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 mx-auto">
								<BadgeCheck className="w-8 h-8 text-primary" />
							</div>
							<h2 className="text-xl font-bold text-center mb-2">
								Verified Resident
							</h2>
							<p className="text-sm text-gray-600 text-center mb-4">
								Full access with identity verification
							</p>
							<div className="flex-1">
								<ul className="space-y-2 text-sm text-gray-600 mb-6">
									<li className="flex items-center gap-2">
										<MessageSquare className="w-4 h-4 text-primary" />
										<span>Comment on issues</span>
									</li>
									<li className="flex items-center gap-2">
										<Vote className="w-4 h-4 text-primary" />
										<span>Vote on polls & issues</span>
									</li>
									<li className="flex items-center gap-2">
										<FileText className="w-4 h-4 text-primary" />
										<span>Access Vox Docs</span>
									</li>
									<li className="flex items-center gap-2">
										<Users className="w-4 h-4 text-primary" />
										<span>Direct government communication</span>
									</li>
								</ul>
							</div>
							<Link href="/signup/verified" className="w-full">
								<Button className="w-full">Verify & Sign Up</Button>
							</Link>
						</div>

						{/* Politician / Government */}
						<div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
							<div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 mx-auto">
								<Building2 className="w-8 h-8 text-blue-600" />
							</div>
							<h2 className="text-xl font-bold text-center mb-2">
								Government Official
							</h2>
							<p className="text-sm text-gray-600 text-center mb-4">
								For politicians and government employees
							</p>
							<div className="flex-1">
								<ul className="space-y-2 text-sm text-gray-600 mb-6">
									<li className="flex items-center gap-2">
										<BadgeCheck className="w-4 h-4 text-blue-600" />
										<span>Official verified badge</span>
									</li>
									<li className="flex items-center gap-2">
										<MessageSquare className="w-4 h-4 text-blue-600" />
										<span>Respond to constituents</span>
									</li>
									<li className="flex items-center gap-2">
										<FileText className="w-4 h-4 text-blue-600" />
										<span>Post official updates</span>
									</li>
									<li className="flex items-center gap-2">
										<Users className="w-4 h-4 text-blue-600" />
										<span>In-person verification</span>
									</li>
								</ul>
							</div>
							<Link href="/signup/government" className="w-full">
								<Button
									variant="outline"
									className="w-full border-blue-600 text-blue-600 hover:bg-blue-50"
								>
									Request Access
								</Button>
							</Link>
						</div>
					</div>

					<p className="text-center text-gray-600 mt-8">
						Already have an account?{" "}
						<Link href="/" className="text-primary hover:underline font-medium">
							Log in
						</Link>
					</p>
				</div>
			</main>
		</div>
	);
}
