/**
 * Feature Flags
 * 
 * Central location for feature flag checks.
 * Flags should be environment variables set to 'true' to enable.
 */

/**
 * Meta Publishing Feature Flag
 * 
 * Controls all Meta (Facebook + Instagram) publishing functionality.
 * When disabled:
 * - No Meta OAuth routes exposed
 * - No Meta UI shown
 * - No publish jobs created for Meta content
 * - No cron execution for Meta jobs
 * - No Meta tokens or IDs written to Airtable
 * 
 * Default: false (disabled)
 * Enable: Set META_PUBLISHING_ENABLED=true in environment
 */
export const isMetaPublishingEnabled = (): boolean => {
	return process.env.META_PUBLISHING_ENABLED === 'true';
};

/**
 * Client-side feature flag check
 * Uses Next.js public env vars (NEXT_PUBLIC_*)
 */
export const isMetaPublishingEnabledClient = (): boolean => {
	return process.env.NEXT_PUBLIC_META_PUBLISHING_ENABLED === 'true';
};
