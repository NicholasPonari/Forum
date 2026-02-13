"use client";

import React, { useEffect, useState } from "react";
import { StatsigProvider, useClientAsyncInit } from "@statsig/react-bindings";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";

function StatsigWrapper({ children }: { children: React.ReactNode }) {
	const user = React.useMemo(() => ({ userID: "a-user" }), []);

	const options = React.useMemo(
		() => ({
			plugins: [
				new StatsigAutoCapturePlugin(),
				new StatsigSessionReplayPlugin(),
			],
		}),
		[],
	);

	const { client, isLoading } = useClientAsyncInit(
		"client-FCsqn9W2urHzSp3WF258MbD6yL8ukmb4vq9SuOMvHTO",
		user,
		options,
	);

	// Render children immediately — don't block on Statsig initialization.
	// Once the client finishes loading, StatsigProvider will provide full functionality.
	if (isLoading) {
		return <>{children}</>;
	}

	return <StatsigProvider client={client}>{children}</StatsigProvider>;
}

export default function MyStatsig({ children }: { children: React.ReactNode }) {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	if (!isClient) {
		return <>{children}</>;
	}

	return <StatsigWrapper>{children}</StatsigWrapper>;
}
