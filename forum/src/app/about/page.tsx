import { Header } from "@/components/page_components/header";
import {
	Users,
	Megaphone,
	Landmark,
	Newspaper,
	Shield,
	CheckCircle,
	Brain,
	Lock,
	Activity,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const AboutPage = () => {
	return (
		<div className="flex min-h-screen flex-col bg-white text-slate-900">
			<Header />
			<main className="flex-1">
				{/* Hero Section */}
				<section className="relative overflow-hidden pt-22 pb-6 sm:pt-22 sm:pb-6">
					<div className="mx-auto max-w-3xl px-6">
						<h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-8">
							About Vox.Vote
						</h1>
						<p className="text-xl font-medium leading-relaxed text-slate-700 sm:text-2xl">
							Vox.Vote exists to make democracy feel real again—at the level where
							it actually touches life: your street, your school, your safety,
							your taxes, your neighbourhood.
						</p>
					</div>
				</section>

				{/* The Problem & Solution */}
				<section className="mx-auto max-w-3xl px-6">
					<div className="prose prose-lg prose-slate max-w-none text-slate-600">
						<p>
							Most people want the same outcomes: competent services, fair rules,
							clean public spaces, safe communities, and leadership that responds
							to reality—not rumor, rage, or whoever shouts loudest online. But
							today, civic conversation is scattered across comment sections and
							group chats that were never designed for legitimacy. It’s easy to
							manipulate, hard to verify, and almost impossible to convert into
							decisions anyone can trust.
						</p>
						<div className="my-6 border-l-4 border-indigo-500 pl-4 bg-indigo-50/50 rounded-r-lg">
							<p className="text-lg font-semibold text-slate-900 italic m-0">
								Vox.Vote is built to close that gap.
							</p>
						</div>
						<p className="text-lg text-slate-700 pl-6">
							We’re creating a verified civic platform where real residents can
							surface issues, propose solutions, and register community signal in
							a way that decision-makers can actually use—while keeping a clear
							public record of what was said, supported, and done.
						</p>
					</div>
				</section>

				<div className="mx-auto w-full max-w-3xl py-8 px-6">
					<div className="h-px bg-slate-200" />
				</div>

				{/* What Vox.Vote is */}
				<section className="mx-auto max-w-3xl px-6 mt-6">
					<span className="text-sm font-bold uppercase tracking-wider text-indigo-600 mb-3 block">
						Definition
					</span>
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">
						What Vox.Vote is
					</h2>
					<p className="text-lg text-slate-700 mb-8">
						Vox.Vote is civic infrastructure for modern participation. It helps
						communities:
					</p>
					<ul className="space-y-4 mb-6">
						{[
							"Identify problems clearly (with context and evidence)",
							"Organize discussion so it becomes usable input, not endless noise",
							"Propose solutions that can be compared side-by-side",
							"Measure sentiment from verified humans—not bots, impersonators, or coordinated brigades",
							"Summarize long threads into neutral, readable briefs",
							"Maintain a durable civic record that doesn’t quietly change when it becomes inconvenient",
						].map((item, i) => (
							<li key={i} className="flex gap-3 items-start text-slate-700">
								<div className="mt-1.5 text-indigo-500 shrink-0">
									<CheckCircle size={18} />
								</div>
								<span>{item}</span>
							</li>
						))}
					</ul>
					<p className="text-lg text-slate-700 font-medium py-6 bg-slate-50 rounded-xl border border-slate-100 mb-6">
						We’re not trying to replace institutions. We’re trying to make them
						work better—by improving the quality of the signal they receive, and
						the trust the public has in the process.
					</p>
				</section>

				{/* Beliefs Grid */}
				<section className="bg-slate-50 py-8 sm:py-8 border-y border-slate-200">
					<div className="mx-auto max-w-3xl px-6">
						<span className="text-sm font-bold uppercase tracking-wider mt-6 text-indigo-600 mb-3 block">
							Philosophy
						</span>
						<h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-6">
							What Vox.Vote believes
						</h2>
						<div className="grid gap-3">
							{[
								{
									title: "Truth beats virality.",
									desc: "A calm, accurate public record is more valuable than a trending outrage cycle.",
								},
								{
									title: "Legitimacy comes from verification.",
									desc: "If you can’t distinguish residents from manipulation, you can’t govern from the signal.",
								},
								{
									title: "Accountability should be routine.",
									desc: "Good actors deserve tools that reduce friction. Bad actors should face daylight by default.",
								},
								{
									title: "The goal is coordination, not domination.",
									desc: "Healthy societies don’t run on humiliation and tribalism. They run on collaboration and clarity.",
								},
								{
									title: "Local trust scales.",
									desc: "If you can earn trust neighbourhood-by-neighbourhood, you can scale to cities, provinces, states, and beyond.",
								},
							].map((belief, i) => (
								<div
									key={i}
									className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-100 transition-colors"
								>
									<h3 className="font-bold text-lg text-slate-900 mb-2">
										{belief.title}
									</h3>
									<p className="text-slate-600">{belief.desc}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* A Proven Direction */}
				<section className="mx-auto max-w-3xl px-6 py-16">
					<h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-6">
						A proven direction: digital government that earns trust
					</h2>
					<div className="space-y-6 text-lg text-slate-700 leading-relaxed">
						<p>
							A few places have shown what modern digital public infrastructure
							can look like when it’s built with seriousness. Estonia is the
							clearest example: strong digital identity, auditable services, and
							systems designed to reduce friction while increasing accountability.
						</p>
						<p>
							Vox.Vote shares that north star—starting with the layer most systems
							neglect: credible public participation.
						</p>
						<p>
							We help communities turn lived experience into structured input that
							institutions can use, while creating a verifiable record of what was
							proposed, supported, and decided. If the 20th century was built on
							paperwork and closed-door processes, the next era should be built on
							clarity, legitimacy, and public trust—earned, not demanded.
						</p>
					</div>
				</section>

				{/* How it works */}
				<section className="bg-slate-900 text-white py-16 sm:py-24">
					<div className="mx-auto max-w-3xl px-6">
						<h2 className="text-3xl font-bold tracking-tight mb-8">
							How Vox.Vote works
						</h2>
						<p className="text-slate-300 text-lg mb-10">
							Vox.Vote turns civic conversation into structured, decision-grade
							inputs:
						</p>
						<div className="grid gap-8 sm:grid-cols-2 mb-12">
							{[
								{
									title: "Verified participation",
									desc: "Prioritizing real humans and real stakeholders",
									icon: <CheckCircle className="w-6 h-6 text-indigo-400" />,
								},
								{
									title: "Issue hubs",
									desc: "One place to track what’s happening, what’s proposed, and what the community supports",
									icon: <Activity className="w-6 h-6 text-indigo-400" />,
								},
								{
									title: "Proposals + voting",
									desc: "Moving from “complaints” to options people can choose between",
									icon: <Megaphone className="w-6 h-6 text-indigo-400" />,
								},
								{
									title: "AI summaries",
									desc: "Compressing long threads into neutral briefs that officials and residents can scan quickly",
									icon: <Brain className="w-6 h-6 text-indigo-400" />,
								},
								{
									title: "Public timelines",
									desc: "Making it easier to follow what changed, when, and why",
									icon: <Newspaper className="w-6 h-6 text-indigo-400" />,
								},
							].map((feature, i) => (
								<div key={i} className="flex gap-4">
									<div className="shrink-0 mt-1">{feature.icon}</div>
									<div>
										<h3 className="font-semibold text-white text-lg">
											{feature.title}
										</h3>
										<p className="text-slate-400 mt-2 leading-relaxed">
											{feature.desc}
										</p>
									</div>
								</div>
							))}
						</div>
						<p className="text-xl font-medium text-white border-t border-slate-700 pt-8">
							The output is simple: less confusion, less manipulation, and more
							actionable clarity—for residents and leaders alike.
						</p>
					</div>
				</section>

				{/* Integrity */}
				<section className="mx-auto max-w-3xl px-6 py-16 sm:py-16">
					<span className="text-sm font-bold uppercase tracking-wider text-indigo-600 mb-3 block">
						Security
					</span>
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">
						Integrity, auditability, and resilience
					</h2>
					<p className="text-lg text-slate-700 mb-10">
						Civic platforms fail when they’re easy to impersonate, easy to
						manipulate, or easy to silence. Vox.Vote is built with a
						security-first posture:
					</p>

					<div className="grid gap-4 sm:grid-cols-2 mb-12">
						{[
							{
								text: "Verification to reduce bots, impersonation, and coordinated manipulation",
								icon: <Shield size={20} />,
							},
							{
								text: "Privacy by design to protect legitimate participation",
								icon: <Lock size={20} />,
							},
							{
								text: "Tamper-evident records so key actions and outcomes can be independently verified",
								icon: <CheckCircle size={20} />,
							},
							{
								text: "Resilient infrastructure designed to reduce single points of failure",
								icon: <Activity size={20} />,
							},
						].map((item, i) => (
							<div
								key={i}
								className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-100"
							>
								<div className="mt-0.5 text-emerald-600 shrink-0">
									{item.icon}
								</div>
								<span className="text-sm font-medium text-slate-700">
									{item.text}
								</span>
							</div>
						))}
					</div>

					<div className="space-y-6 text-lg text-slate-700 leading-relaxed border-t border-slate-100 pt-8">
						<p>
							Under the hood, that can include blockchain-based primitives and
							distributed architecture. Not as a marketing theme—simply as a
							practical way to make records durable, verification stronger, and
							trust cheaper to maintain.
						</p>
						<p className="text-lg font-semibold text-slate-900">
							We’re not building a place for harassment, pile-ons, or theatre.
						</p>
						<p className="text-lg text-slate-700">
							We’re building a place for real people to have real conversations
							about real issues.
						</p>
					</div>
				</section>

				{/* Who Vox.Vote is for */}
				<section className="bg-indigo-50 py-16 sm:py-16 border-y border-indigo-100">
					<div className="mx-auto max-w-3xl px-6">
						<span className="text-sm font-bold uppercase tracking-wider text-indigo-600 mb-3 block">
							Audience
						</span>
						<h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-10">
							Who Vox.Vote is for
						</h2>
						<div className="grid gap-6 sm:grid-cols-2">
							{/* Residents */}
							<div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
								<div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 mb-4">
									<Users size={20} />
								</div>
								<h3 className="font-bold text-lg text-slate-900 mb-2">
									Residents
								</h3>
								<p className="text-slate-600">
									Who want their time to matter, and who want to improve their
									community without getting dragged into chaos.
								</p>
							</div>
							{/* Neighbourhood leaders */}
							<div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
								<div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 mb-4">
									<Megaphone size={20} />
								</div>
								<h3 className="font-bold text-lg text-slate-900 mb-2">
									Neighbourhood leaders
								</h3>
								<p className="text-slate-600">
									Who need a legitimate way to rally support, test ideas, and
									communicate clearly.
								</p>
							</div>
							{/* Elected officials */}
							<div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
								<div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 mb-4">
									<Landmark size={20} />
								</div>
								<h3 className="font-bold text-lg text-slate-900 mb-2">
									Elected officials
								</h3>
								<p className="text-slate-600">
									Who want better inputs than anecdotes, outrage cycles, or noisy
									inboxes—along with a clearer mandate.
								</p>
							</div>
							{/* Journalists */}
							<div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
								<div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 mb-4">
									<Newspaper size={20} />
								</div>
								<h3 className="font-bold text-lg text-slate-900 mb-2">
									Journalists & Researchers
								</h3>
								<p className="text-slate-600">
									Who want a cleaner public record of what communities are
									experiencing, proposing, and supporting.
								</p>
							</div>
						</div>
						<p className="mt-10 text-xl font-medium text-center text-indigo-900">
							If you care about a society that’s safer, more functional, and more
							trustworthy—Vox.Vote is for you.
						</p>
					</div>
				</section>

				{/* Founders */}
				<section className="mx-auto max-w-3xl px-6 py-16 sm:py-16">
					<span className="text-sm font-bold uppercase tracking-wider text-indigo-600 mb-3 block">
						Leadership
					</span>
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-10">
						Founders
					</h2>
					<div className="space-y-12">
						<div className="flex flex-col md:flex-row gap-6 md:items-start">
							<div className="flex-1">
								<h3 className="text-xl font-bold text-slate-900">
									Christopher Olimpo
								</h3>
								<p className="text-sm text-indigo-600 font-medium mb-3">
									Co-Founder & CEO
								</p>
								<p className="text-slate-700 leading-relaxed">
								Christopher Olimpo is an entrepreneur, product inventor, and executive creative director known for building and shipping high-impact digital products—combining product management discipline, narrative craft, and execution under pressure. His work spans software and marketing partnerships with Tom Cruise, LeBron James, Saudi Arabia, and organizations including Warner Bros., Universal Studios, Sony, and Twitter/X. He is a Clio Award winner, and has worked with Lockheed Martin on ITAR-controlled U.S. and Canadian Navy simulation programs. He previously raised $3.3M to build Arcadia, an XR sports platform. At Vox.Vote, Christopher applies that same rigor to civic infrastructure: verified participation, usable public input, and a durable public record that helps institutions govern with legitimacy and helps communities engage with confidence.
								</p>
							</div>
						</div>
						<div className="flex flex-col md:flex-row gap-6 md:items-start">
							<div className="flex-1">
								<h3 className="text-xl font-bold text-slate-900">
									Nicholas Ponari
								</h3>
								<p className="text-sm text-indigo-600 font-medium mb-3">
									Co-Founder & CTO
								</p>
								<p className="text-slate-700 leading-relaxed">
									Nicholas Ponari is a technologist, civic candidate, and technical product leader focused on building systems that improve public outcomes in the real world. He has run for office twice in Canada (provincially and federally) and has led cross-disciplinary teams of academics developing cutting-edge AI assistants in healthcare. Nicholas is also an active startup investor, including Mysa—one of Canada’s leading platforms for home energy optimization and emissions reduction—and Arcadia, which is building athletic gaming experiences that counter sedentary lifestyles and strengthen community health. At Vox.Vote, he brings security-minded engineering, product rigor, and a public-service perspective to build trusted civic infrastructure that scales.
								</p>
							</div>
						</div>
					</div>
				</section>

				{/* Together */}
				<section className="bg-slate-900 text-white py-16">
					<div className="mx-auto max-w-3xl px-6 text-center">
						<h2 className="text-3xl font-bold tracking-tight mb-6">Together</h2>
						<p className="text-lg text-slate-300 mb-6 leading-relaxed">
							Vox.Vote was founded on a simple observation: most people are
							reasonable, but the systems we use to communicate and decide are
							not.
						</p>
						<p className="text-lg text-slate-300 mb-8 leading-relaxed">
							We’re building a platform where communities can disagree without
							collapsing into division, where public input becomes structured and
							usable, and where institutions can earn trust by responding to
							reality with transparency.
						</p>
						<p className="text-xl font-bold text-white">
							Democracy doesn’t need more noise. It needs better instruments.
						</p>
					</div>
				</section>

				{/* Join Vox.Vote */}
				<section className="mx-auto max-w-3xl px-6 py-16 sm:py-24 text-center">
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-6">
						Join Vox.Vote
					</h2>
					<p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
						Start locally. Read, post, propose, and vote. Help your community move
						from frustration to solutions—and make the public record stronger in
						the process.
					</p>
					<Link href="/signup">
						<Button className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-full shadow-lg shadow-indigo-200">
							<span>Vox.Vote: verified voices, real outcomes.</span>
						</Button>
					</Link>
				</section>
			</main>
		</div>
	);
};

export default AboutPage;
