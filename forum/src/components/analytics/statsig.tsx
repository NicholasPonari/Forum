"use client";

import React from "react";
import { StatsigProvider, useClientAsyncInit } from "@statsig/react-bindings";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";

export default function MyStatsig({ children }: { children: React.ReactNode }) {
	const { client } = useClientAsyncInit(
		"client-FCsqn9W2urHzSp3WF258MbD6yL8ukmb4vq9SuOMvHTO",
		{ userID: "a-user" },
		{
			plugins: [
				new StatsigAutoCapturePlugin(),
				new StatsigSessionReplayPlugin(),
			],
		}
	);

	return (
		<StatsigProvider client={client}>
			{children}
		</StatsigProvider>
	);
}
