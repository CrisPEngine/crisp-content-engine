import { isSidecarContentIdeasEnabled } from '@/lib/featureFlags';
import { SidecarError } from '@/lib/sidecar/errors';
import { sidecarOptionsResponse } from '@/lib/sidecar/cors';
import { runSidecarRoute } from '@/lib/sidecar/handler';
import { sidecarContentIdeaRequestSchema } from '@/lib/sidecar/schemas';
import { createSidecarContentIdea } from '@/lib/sidecar/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
	return sidecarOptionsResponse(request);
}

export async function POST(request: Request) {
	return runSidecarRoute(request, async (actor, req) => {
		if (!isSidecarContentIdeasEnabled()) {
			throw new SidecarError('Content ideas are disabled', {
				status: 404,
				code: 'sidecar_content_ideas_disabled',
			});
		}
		const body = await req.json().catch(() => ({}));
		const input = sidecarContentIdeaRequestSchema.parse(body);
		const result = await createSidecarContentIdea(actor.userId, input);
		return result;
	});
}
