export function brandNameFromIdentity(identity: unknown): string {
	if (!identity || typeof identity !== 'object') return 'Brand';
	const name = (identity as { name?: string }).name;
	return typeof name === 'string' && name.trim() ? name.trim() : 'Brand';
}

export function formatInstagramHandle(handle?: string | null, displayName?: string | null): string {
	if (displayName?.startsWith('@')) return displayName;
	if (handle) return `@${handle.replace(/^@/, '')}`;
	if (displayName) return displayName;
	return 'Instagram account';
}
