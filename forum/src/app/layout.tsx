import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/context/AuthContext";
import { PerfDebug } from "@/components/debug/PerfDebug";
import "./globals.css";
import MyStatsig from "@/components/analytics/statsig";

export const metadata: Metadata = {
	title: "Vox.Vote - Plan Together. Act.",
	description:
		"Plan together. Act together. Join Vox.Vote to share issues, discuss, and collaborate on solutions.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
			>
				<PerfDebug />
				<AuthProvider>
					<MyStatsig>{children}</MyStatsig>
				</AuthProvider>
				<Toaster />
				<Analytics />
			</body>
		</html>
	);
}
