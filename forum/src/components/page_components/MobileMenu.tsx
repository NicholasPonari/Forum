import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { Shield } from "lucide-react";

interface MobileMenuProps {
	setModalOpen?: (open: boolean) => void;
	user?: User;
	signOut?: () => void;
	profileType?: string | null;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
	setModalOpen,
	user,
	signOut,
	profileType,
}) => {
	const [open, setOpen] = React.useState(false);
	const upgradeHref = user
		? `/signup/verified?mode=upgrade&returnTo=${encodeURIComponent(
				`/profile/${user.id}`
		  )}`
		: "/signup/verified";

	return (
		<div className="relative">
			<button
				className="text-black focus:outline-none flex items-center justify-center w-10 h-10"
				aria-label="Open menu"
				onClick={() => setOpen((prev) => !prev)}
			>
				<svg
					width="24"
					height="24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="feather feather-menu"
				>
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			</button>
			{open && (
				<div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl py-3 px-4 flex flex-col gap-2 min-w-[200px] z-[100] border border-gray-100">
					{user ? (
						<>
							<Link href="/about" onClick={() => setOpen(false)}>
								<Button variant="ghost" className="w-full justify-start">
									About Us
								</Button>
							</Link>
							<Link href="/learn-more" onClick={() => setOpen(false)}>
								<Button variant="ghost" className="w-full justify-start">
									Learn More
								</Button>
							</Link>
							{profileType === "Member" && (
								<Link href={upgradeHref} onClick={() => setOpen(false)}>
									<Button variant="ghost" className="w-full justify-start">
										Upgrade to Resident
									</Button>
								</Link>
							)}
							{profileType === "Admin" && (
								<Link href="/admin" onClick={() => setOpen(false)}>
									<Button
										variant="ghost"
										className="w-full justify-start text-red-600"
									>
										<Shield className="w-4 h-4 mr-2" />
										Admin Panel
									</Button>
								</Link>
							)}
							<Button
								variant="ghost"
								className="justify-start"
								onClick={signOut}
							>
								Sign Out
							</Button>
						</>
					) : (
						<>
							<Link href="/about" onClick={() => setOpen(false)}>
								<Button variant="ghost" className="w-full justify-start">
									About Us
								</Button>
							</Link>
							<Link href="/learn-more" onClick={() => setOpen(false)}>
								<Button variant="ghost" className="w-full justify-start">
									Learn More
								</Button>
							</Link>
							<Link href="/signup" onClick={() => setOpen(false)}>
								<Button variant="outline" className="w-full justify-start">
									Sign Up
								</Button>
							</Link>
							<Button
								variant="ghost"
								className="w-full justify-start"
								onClick={() => {
									if (setModalOpen) setModalOpen(true);
									setOpen(false);
								}}
							>
								Log In
							</Button>
						</>
					)}
				</div>
			)}
		</div>
	);
};
