"use client";

import { useAuth } from "@/context/AuthContext";
import { translations, Language } from "@/lib/i18n/translations";

export function useTranslation() {
	const { profile } = useAuth();
	// Default to English if no language is set or if profile is not loaded yet
	const language: Language = (profile?.language as Language) || "en";

	return {
		t: translations[language],
		language,
	};
}
