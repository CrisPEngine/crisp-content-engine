import { sidecarOptionsResponse } from '@/lib/sidecar/cors';
import { runSidecarRoute } from '@/lib/sidecar/handler';
import { sidecarOpportunityRequestSchema } from '@/lib/sidecar/schemas';
import { saveSidecarOpportunity } from '@/lib/sidecar/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
	return sidecarOptionsResponse(request);
}

export async function POST(request: Request) {
	return runSidecarRoute(request, async (actor, req) => {
		const body = await req.json().catch(() => ({}));
		const input = sidecarOpportunityRequestSchema.parse(body);
		const result = await saveSidecarOpportunity(actor.userId, input);
		return result;
	});
}
