import 'server-only';

import type { DestinationProviderId, ProviderDefinition } from '../types';
import { PAYLOAD_CONTENT_CAPABILITIES } from '../contentCapabilities';
import { payloadContentApiAdapter } from './payload';

const UNAVAILABLE = {
	testConnection: false,
	taxonomy: false,
	draftLookup: false,
	draftSubmission: false,
	mediaUpload: false,
	scheduling: false,
	publishing: false as const,
};

export const PROVIDERS: Record<DestinationProviderId, ProviderDefinition> = {
	payload_content_api: {
		id: 'payload_content_api',
		label: 'Payload CMS (content API)',
		available: true,
		note: 'Draft create and update, taxonomy, media upload. Publication stays a manual CMS action.',
		capabilities: { testConnection: true, taxonomy: true, draftLookup: true, draftSubmission: true, mediaUpload: true, scheduling: true, publishing: false },
		content: PAYLOAD_CONTENT_CAPABILITIES,
		adapter: payloadContentApiAdapter,
	},
	wordpress: { id: 'wordpress', label: 'WordPress', available: false, note: 'Planned. Not connected yet.', capabilities: UNAVAILABLE, content: null, adapter: null },
	webflow: { id: 'webflow', label: 'Webflow', available: false, note: 'Planned. Not connected yet.', capabilities: UNAVAILABLE, content: null, adapter: null },
	ghost: { id: 'ghost', label: 'Ghost', available: false, note: 'Planned. Not connected yet.', capabilities: UNAVAILABLE, content: null, adapter: null },
	custom_api: { id: 'custom_api', label: 'Custom API', available: false, note: 'Planned. Not connected yet.', capabilities: UNAVAILABLE, content: null, adapter: null },
};

export function providerDefinition(id: string): ProviderDefinition | null {
	return (PROVIDERS as Record<string, ProviderDefinition>)[id] ?? null;
}
