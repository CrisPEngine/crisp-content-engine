import { NextResponse } from 'next/server';
import { handleInstagramOAuthCallback } from '@/lib/instagram/callbackHandler';

export const runtime = 'nodejs';

/** Alias callback registered in Meta (same handler, matching redirect URI). */
export async function GET(request: Request) {
	return handleInstagramOAuthCallback(request, 'meta');
}
