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
