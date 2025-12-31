export function formatTimeAgo(
	dateString: string,
	tTime?: {
		justNow: string;
		ago: string;
		s: string;
		m: string;
		h: string;
		d: string;
		mo: string;
		y: string;
	}
): string {
	const now = new Date();
	const date = new Date(dateString);
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	// Default English labels if no translation provided
	const labels = tTime || {
		justNow: "just now",
		ago: "ago",
		s: "s",
		m: "m",
		h: "h",
		d: "d",
		mo: "mo",
		y: "y",
	};

	const suffix = tTime?.ago ? ` ${tTime.ago}` : " ago";

	if (diffInSeconds < 60) {
		return `${diffInSeconds}${labels.s}${suffix}`;
	}

	const diffInMinutes = Math.floor(diffInSeconds / 60);
	if (diffInMinutes < 60) {
		return `${diffInMinutes}${labels.m}${suffix}`;
	}

	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) {
		return `${diffInHours}${labels.h}${suffix}`;
	}

	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 30) {
		return `${diffInDays}${labels.d}${suffix}`;
	}

	const diffInMonths = Math.floor(diffInDays / 30);
	if (diffInMonths < 12) {
		return `${diffInMonths}${labels.mo}${suffix}`;
	}

	const diffInYears = Math.floor(diffInMonths / 12);
	return `${diffInYears}${labels.y}${suffix}`;
}
