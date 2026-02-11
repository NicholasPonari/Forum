"use client";

import React from "react";
import { StatsigProvider, useClientAsyncInit } from "@statsig/react-bindings";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";

export default function MyStatsig({ children }: { children: React.ReactNode }) {
	const user = React.useMemo(() => ({ userID: "a-user" }), []);

	const options = React.useMemo(
		() => ({
			plugins: [
				new StatsigAutoCapturePlugin(),
				new StatsigSessionReplayPlugin(),
			],
		}),
		[]
	);

	const { client } = useClientAsyncInit(
		"client-FCsqn9W2urHzSp3WF258MbD6yL8ukmb4vq9SuOMvHTO",
		user,
		options
	);

	return (
		<StatsigProvider client={client}>
			{children}
		</StatsigProvider>
	);
}
