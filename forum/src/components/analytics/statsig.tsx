"use client";

import React, { useEffect, useState } from "react";
import { StatsigProvider, useClientAsyncInit } from "@statsig/react-bindings";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";

export default function MyStatsig({ children }: { children: React.ReactNode }) {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

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

	if (!isClient) {
		return <>{children}</>;
	}

	return (
		<StatsigProvider client={client}>
			{children}
		</StatsigProvider>
	);
}
