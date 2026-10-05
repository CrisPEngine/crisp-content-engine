import { handleThreadsOAuthCallback } from '@/lib/threads/callbackHandler';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	return handleThreadsOAuthCallback(request);
}
