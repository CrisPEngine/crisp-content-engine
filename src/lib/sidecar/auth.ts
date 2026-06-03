import 'server-only';

import { SidecarError } from './errors';

export type SidecarActor = {
	type: 'bearer_secret';
	userId: string;
};

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i += 1) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

function parseBearerToken(request: Request): string | null {
	const header = request.headers.get('authorization');
	if (!header?.toLowerCase().startsWith('bearer ')) return null;
	const token = header.slice(7).trim();
	return token || null;
}

export function requireSidecarAuth(request: Request): SidecarActor {
	const configuredSecret = process.env.SIDECAR_API_SECRET;
	const ownerUserId = process.env.SIDECAR_OWNER_USER_ID;

	if (!configuredSecret || !ownerUserId) {
		throw new SidecarError('Sidecar authentication is not configured', {
			status: 503,
			code: 'sidecar_auth_not_configured',
		});
	}

	const token = parseBearerToken(request);
	if (!token || !safeEqual(token, configuredSecret)) {
		throw new SidecarError('Not authenticated', {
			status: 401,
			code: 'sidecar_not_authenticated',
		});
	}

	return {
		type: 'bearer_secret',
		userId: ownerUserId,
	};
}
