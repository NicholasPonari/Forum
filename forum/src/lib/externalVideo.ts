export type ExternalVideoProvider = "youtube" | "instagram";

export interface ExternalVideoEmbedInfo {
	provider: ExternalVideoProvider;
	embedUrl: string;
	canonicalUrl: string;
}

const parseYouTubeId = (url: URL): string | null => {
	const host = url.hostname.replace(/^www\./, "");

	if (host === "youtu.be") {
		const id = url.pathname.split("/").filter(Boolean)[0];
		return id || null;
	}

	if (host.endsWith("youtube.com")) {
		if (url.pathname === "/watch") {
			return url.searchParams.get("v");
		}

		const parts = url.pathname.split("/").filter(Boolean);
		if (parts.length >= 2 && (parts[0] === "shorts" || parts[0] === "embed")) {
			return parts[1];
		}
	}

	return null;
};

const parseInstagramPath = (url: URL): { kind: string; code: string } | null => {
	const host = url.hostname.replace(/^www\./, "");
	if (host !== "instagram.com") {
		return null;
	}

	const parts = url.pathname.split("/").filter(Boolean);
	if (parts.length < 2) {
		return null;
	}

	const kind = parts[0];
	const code = parts[1];
	if (!["reel", "p", "tv"].includes(kind) || !code) {
		return null;
	}

	return { kind, code };
};

export const getExternalVideoEmbedInfo = (
	rawUrl?: string | null,
): ExternalVideoEmbedInfo | null => {
	if (!rawUrl) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}

	if (!["http:", "https:"].includes(url.protocol)) {
		return null;
	}

	const youtubeId = parseYouTubeId(url);
	if (youtubeId) {
		return {
			provider: "youtube",
			embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
			canonicalUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
		};
	}

	const instagramPath = parseInstagramPath(url);
	if (instagramPath) {
		return {
			provider: "instagram",
			embedUrl: `https://www.instagram.com/${instagramPath.kind}/${instagramPath.code}/embed`,
			canonicalUrl: `https://www.instagram.com/${instagramPath.kind}/${instagramPath.code}/`,
		};
	}

	return null;
};
