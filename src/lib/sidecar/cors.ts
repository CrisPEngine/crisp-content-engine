import { NextResponse } from 'next/server';
import { isSidecarApiEnabled } from '@/lib/featureFlags';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Request-Id';

/**
 * CORS Allow-Origin is only set for:
 * - chrome-extension://* (Sidecar panel)
 * - optional SIDECAR_CORS_ALLOWED_ORIGINS (comma-separated full origins, e.g. https://app.crispdigital.io)
 *
 * The CCE API host is the fetch *target* (extension host_permissions), not a CORS origin.
 */
function isAllowedCorsOrigin(origin: string | null): boolean {
	if (!origin) return false;
	if (origin.startsWith('chrome-extension://')) return true;

	const configured = process.env.SIDECAR_CORS_ALLOWED_ORIGINS;
	if (!configured?.trim()) return false;

	return configured
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
		.includes(origin);
}

export function sidecarCorsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get('origin');
	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': ALLOWED_METHODS,
		'Access-Control-Allow-Headers': ALLOWED_HEADERS,
		'Access-Control-Max-Age': '86400',
	};

	if (isAllowedCorsOrigin(origin)) {
		headers['Access-Control-Allow-Origin'] = origin!;
		headers.Vary = 'Origin';
	}

	return headers;
}

export function withSidecarCors<T extends Record<string, unknown>>(
	request: Request,
	body: T,
	init?: { status?: number },
): NextResponse {
	return NextResponse.json(body, {
		status: init?.status ?? 200,
		headers: sidecarCorsHeaders(request),
	});
}

export function sidecarOptionsResponse(request: Request): NextResponse {
	if (!isSidecarApiEnabled()) {
		return new NextResponse(null, { status: 404 });
	}
	return new NextResponse(null, {
		status: 204,
		headers: sidecarCorsHeaders(request),
	});
}
