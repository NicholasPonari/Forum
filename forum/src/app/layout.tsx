import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/context/AuthContext";
import { PerfDebug } from "@/components/debug/PerfDebug";
import "./globals.css";
import MyStatsig from "@/components/analytics/statsig";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

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
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
