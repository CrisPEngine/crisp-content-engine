/** Native social provider keys (authorization.provider / destination.provider). */
export const SOCIAL_PROVIDERS = {
	FACEBOOK: 'facebook',
	/** Legacy Meta Facebook Login bundle (read-only sync from meta_connections). */
	META_LEGACY: 'meta',
	INSTAGRAM: 'instagram',
	THREADS: 'threads',
	LINKEDIN: 'linkedin',
} as const;

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[keyof typeof SOCIAL_PROVIDERS];

export const DESTINATION_TYPES = {
	FACEBOOK_PAGE: 'page',
	/** Instagram professional account discovered via Facebook Page token. */
	INSTAGRAM_LINKED: 'instagram',
	/** Instagram API with Instagram Login (no Facebook Page required). */
	INSTAGRAM_PROFESSIONAL: 'instagram_professional',
	THREADS_PROFILE: 'threads_profile',
	LINKEDIN_PROFILE: 'profile',
	LINKEDIN_ORGANIZATION: 'organization',
} as const;
