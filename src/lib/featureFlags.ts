/**
 * Feature Flags
 *
 * Central location for feature flag checks.
 */

/**
 * Meta Publishing
 *
 * Meta (Facebook + Instagram) publishing is live and enabled by default after Meta App Review approval.
 * Set META_PUBLISHING_ENABLED=false (server) or NEXT_PUBLIC_META_PUBLISHING_ENABLED=false (client) to disable.
 */
export const isMetaPublishingEnabled = (): boolean => {
	return process.env.META_PUBLISHING_ENABLED !== 'false';
};

/**
 * Client-side: Meta publishing enabled unless explicitly disabled.
 */
export const isMetaPublishingEnabledClient = (): boolean => {
	return process.env.NEXT_PUBLIC_META_PUBLISHING_ENABLED !== 'false';
};

/**
 * Operator console / MCP groundwork
 *
 * Disabled by default (unset or any value other than "true").
 * Set OPERATOR_CONSOLE_ENABLED=true (server) and
 * NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED=true (admin UI link only) to enable.
 */
export const isOperatorConsoleEnabled = (): boolean => {
	return process.env.OPERATOR_CONSOLE_ENABLED === 'true';
};

export const isOperatorConsoleEnabledClient = (): boolean => {
	return process.env.NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED === 'true';
};

/**
 * CRISP Sidecar API (extension + /api/sidecar/*)
 *
 * Disabled by default. Set SIDECAR_API_ENABLED=true to enable server routes.
 */
export const isSidecarApiEnabled = (): boolean => {
	return process.env.SIDECAR_API_ENABLED === 'true';
};

export const isSidecarSaveContactsEnabled = (): boolean => {
	return process.env.SIDECAR_SAVE_CONTACTS_ENABLED !== 'false';
};

export const isSidecarContentIdeasEnabled = (): boolean => {
	return process.env.SIDECAR_CONTENT_IDEAS_ENABLED !== 'false';
};

export const isSidecarEnabledClient = (): boolean => {
	return process.env.NEXT_PUBLIC_ENABLE_SIDECAR === 'true';
};

/**
 * Native Idea Engine generation (replaces Make.com for series + regenerate).
 * When false, falls back to MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL.
 */
export const isIdeaEngineNativeEnabled = (): boolean => {
	return process.env.IDEA_ENGINE_NATIVE_ENABLED === 'true';
};

/**
 * Brand-scoped native intelligence pilot.
 * Off unless NATIVE_INTELLIGENCE_ENABLED=true and the canonical brand_brains.id
 * is listed in NATIVE_INTELLIGENCE_BRAND_ALLOWLIST. An empty list enables nobody.
 * Airtable BrandProfiles ids are not eligibility keys. Callers resolve the
 * compatibility record to the brand brain, then check that canonical id here.
 * Make generation stays available for every brand that is not on the list.
 */
export function nativeIntelligenceBrandAllowlist(): string[] {
	return (process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST || '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

export function isNativeIntelligenceEnabledForBrand(canonicalBrandId: string | null | undefined): boolean {
	if (process.env.NATIVE_INTELLIGENCE_ENABLED !== 'true') return false;
	if (!canonicalBrandId) return false;
	return nativeIntelligenceBrandAllowlist().includes(canonicalBrandId);
}
