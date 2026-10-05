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

/** Threads publishing — enabled when app id is configured unless explicitly disabled. */
export const isThreadsPublishingEnabled = (): boolean => {
	if (process.env.THREADS_PUBLISHING_ENABLED === 'false') return false;
	return Boolean(process.env.THREADS_APP_ID?.trim());
};

export const isThreadsPublishingEnabledClient = (): boolean => {
	if (process.env.NEXT_PUBLIC_THREADS_PUBLISHING_ENABLED === 'false') return false;
	return Boolean(process.env.NEXT_PUBLIC_THREADS_APP_ID?.trim() || process.env.THREADS_APP_ID?.trim());
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
 * Global emergency stop for native generation.
 * Absent or any value other than the string "false" means native intelligence is on.
 * NATIVE_INTELLIGENCE_BRAND_ALLOWLIST is ignored. Eligibility is the native brand record.
 */
export function isNativeIntelligenceGloballyEnabled(): boolean {
	return process.env.NATIVE_INTELLIGENCE_ENABLED !== 'false';
}

/** @deprecated Ignored. Kept so old environments can still be read for diagnostics. */
export function nativeIntelligenceBrandAllowlist(): string[] {
	return (process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST || '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

export type NativeIntelligenceBlock = 'native_intelligence_globally_disabled' | 'native_intelligence_brand_disabled';

export function nativeIntelligenceBlock(brand: { nativeIntelligenceEnabled?: boolean } | null | undefined): NativeIntelligenceBlock | null {
	if (!isNativeIntelligenceGloballyEnabled()) return 'native_intelligence_globally_disabled';
	if (brand?.nativeIntelligenceEnabled === false) return 'native_intelligence_brand_disabled';
	return null;
}
