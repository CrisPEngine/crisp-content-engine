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
