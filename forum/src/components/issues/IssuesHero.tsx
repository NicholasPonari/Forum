import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/use-translation";

interface IssuesHeroProps {
	startLogoRef: React.RefObject<HTMLDivElement | null>;
	motionStyle?: any; // Using any to simplify motion style type passing
}

export function IssuesHero({ startLogoRef, motionStyle }: IssuesHeroProps) {
	const { user } = useAuth();
	const { t } = useTranslation();

	return (
		<>
			<h1 className="text-4xl font-bold mb-6 text-center flex items-center justify-center gap-2 min-h-[32px]">
				{/* Placeholder to prevent layout shift when logo becomes fixed */}
				<div ref={startLogoRef} className="w-[150px] h-[32px] relative">
					{motionStyle ? (
						<motion.div
							className="md:block w-[150px] h-[32px]"
							style={motionStyle}
						>
							<Image
								src="/vox-vote-logo.png"
								alt="vox-vote-logo"
								width={150}
								height={32}
								priority
							/>
						</motion.div>
					) : (
						<div className="md:block w-[150px] h-[32px]">
							<Image
								src="/vox-vote-logo.png"
								alt="vox-vote-logo"
								width={150}
								height={32}
								priority
							/>
						</div>
					)}
				</div>
			</h1>
			<div className="flex flex-col items-center mb-10">
				<p className="text-lg font-semibold text-center leading-6.5">
					{t.hero.tagline1}
				</p>
				<p className="text-lg font-semibold text-center leading-6.5">
					{t.hero.tagline2}
				</p>
				<p className="text-lg font-semibold text-center leading-6.5">
					{t.hero.tagline3}
				</p>
			</div>

			{user ? null : (
				<div className="flex items-center justify-center mb-9 mt-9">
					<Link href="/signup">
						<Button className="mr-4 bg-primary hover:bg-primary/80 text-white rounded-md">
							{t.hero.join}
						</Button>
					</Link>
					<Link href="/about">
						<Button className="bg-white border-primary border-2 hover:border-primary hover:bg-primary/80 text-primary rounded-md">
							{t.hero.learnMore}
						</Button>
					</Link>
				</div>
			)}
		</>
	);
}
