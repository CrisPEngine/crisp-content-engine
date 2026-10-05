import { handleInstagramOAuthCallback } from '@/lib/instagram/callbackHandler';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	return handleInstagramOAuthCallback(request, 'connections');
}
