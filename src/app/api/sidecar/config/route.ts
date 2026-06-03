import {
	isSidecarApiEnabled,
	isSidecarContentIdeasEnabled,
	isSidecarSaveContactsEnabled,
} from '@/lib/featureFlags';
import { sidecarOptionsResponse } from '@/lib/sidecar/cors';
import { runSidecarRoute } from '@/lib/sidecar/handler';
import {
	CONTACT_TYPES,
	CONSENT_STATUSES,
	CTA_STRENGTHS,
	MESSAGE_TYPES,
	OBJECTIVES,
	RELATIONSHIP_STAGES,
	SUPPORTED_PLATFORMS,
} from '@/lib/sidecar/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
	return sidecarOptionsResponse(request);
}

export async function GET(request: Request) {
	return runSidecarRoute(request, async () => ({
		version: '1',
		enabled: isSidecarApiEnabled(),
		features: {
			saveContacts: isSidecarSaveContactsEnabled(),
			contentIdeas: isSidecarContentIdeasEnabled(),
		},
		enums: {
			messageTypes: MESSAGE_TYPES,
			objectives: OBJECTIVES,
			ctaStrengths: CTA_STRENGTHS,
			relationshipStages: RELATIONSHIP_STAGES,
			contactTypes: CONTACT_TYPES,
			consentStatuses: CONSENT_STATUSES,
		},
		supportedPlatforms: SUPPORTED_PLATFORMS,
		limits: {
			maxSelectedTextLength: 8000,
			maxUserNotesLength: 4000,
		},
	}));
}
