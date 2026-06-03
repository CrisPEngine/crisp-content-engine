import { sidecarOptionsResponse } from '@/lib/sidecar/cors';
import { listSidecarBrands } from '@/lib/sidecar/brands';
import { runSidecarRoute } from '@/lib/sidecar/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
	return sidecarOptionsResponse(request);
}

export async function GET(request: Request) {
	return runSidecarRoute(request, async (actor) => {
		const { brands, meta } = await listSidecarBrands(actor.userId);
		return { brands, meta };
	});
}
