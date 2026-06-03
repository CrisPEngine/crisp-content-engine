import { isSidecarSaveContactsEnabled } from '@/lib/featureFlags';
import { SidecarError } from '@/lib/sidecar/errors';
import { sidecarOptionsResponse } from '@/lib/sidecar/cors';
import { runSidecarRoute } from '@/lib/sidecar/handler';
import { sidecarContactRequestSchema } from '@/lib/sidecar/schemas';
import { saveSidecarContact } from '@/lib/sidecar/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
	return sidecarOptionsResponse(request);
}

export async function POST(request: Request) {
	return runSidecarRoute(request, async (actor, req) => {
		if (!isSidecarSaveContactsEnabled()) {
			throw new SidecarError('Saving contacts is disabled', {
				status: 404,
				code: 'sidecar_contacts_disabled',
			});
		}
		const body = await req.json().catch(() => ({}));
		const input = sidecarContactRequestSchema.parse(body);
		const result = await saveSidecarContact(actor.userId, input);
		return result;
	});
}
