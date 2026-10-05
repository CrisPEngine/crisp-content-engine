/**
 * Validates post-auth redirect paths (open-redirect safe).
 */
export function safeRedirectPath(input: string | null | undefined, fallback = '/dashboard'): string {
	if (!input || typeof input !== 'string') return fallback;
	const trimmed = input.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
	if (trimmed.includes('://')) return fallback;
	if (trimmed.startsWith('/sign-in') || trimmed.startsWith('/login')) return fallback;
	return trimmed;
}
