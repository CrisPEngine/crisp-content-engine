import { fetchFolianTaxonomy, folianBaseUrl, folianHeaders } from './folianClient';
import { loadDestinationTaxonomy } from './destinationRegistry';
import type { DestinationTaxonomy } from './destinationTaxonomy';

export type WebsiteDestinationView = {
	id: string;
	name: string;
	cmsType: string;
	connected: boolean;
	health: 'healthy' | 'degraded' | 'disconnected' | 'error';
	taxonomyAvailable: boolean;
	draftSubmission: boolean;
	publishing: boolean;
	publishingNote: string;
	lastSyncAt: string | null;
	error: string | null;
	taxonomy: DestinationTaxonomy | null;
};

const PUBLISHING_NOTE =
	'Automated publication stays off. A person publishes the approved draft in the CMS. CCE can submit and update drafts.';

export function websitePublishingEnabled(): boolean {
	return process.env.CCE_WEBSITE_PUBLISH_ENABLED === 'true';
}

export async function inspectWebsiteDestinations(): Promise<WebsiteDestinationView[]> {
	const configured = Boolean(folianBaseUrl() && folianHeaders(true));
	let taxonomy: DestinationTaxonomy | null = null;
	let error: string | null = null;
	let health: WebsiteDestinationView['health'] = configured ? 'degraded' : 'disconnected';
	if (configured) {
		try {
			taxonomy = await fetchFolianTaxonomy();
			if (taxonomy) health = 'healthy';
			else {
				taxonomy = await loadDestinationTaxonomy('folian');
				health = taxonomy ? 'degraded' : 'error';
				error = taxonomy ? 'Live taxonomy was unavailable. Showing the configured fallback.' : 'Taxonomy could not be loaded.';
			}
		} catch (caught) {
			health = 'error';
			error = caught instanceof Error ? caught.message : 'Taxonomy request failed.';
			taxonomy = await loadDestinationTaxonomy('folian');
		}
	}
	return [
		{
			id: 'folian',
			name: 'Folian',
			cmsType: 'Payload',
			connected: configured,
			health,
			taxonomyAvailable: Boolean(taxonomy?.categories.length),
			draftSubmission: configured,
			publishing: websitePublishingEnabled(),
			publishingNote: websitePublishingEnabled()
				? 'Privileged website publication is enabled. The Folian adapter still submits drafts; live publish remains a Payload action.'
				: PUBLISHING_NOTE,
			lastSyncAt: taxonomy ? new Date().toISOString() : null,
			error,
			taxonomy,
		},
	];
}

export async function taxonomyForDestination(destinationId: string): Promise<DestinationTaxonomy | null> {
	const match = (await inspectWebsiteDestinations()).find((item) => item.id === destinationId);
	return match?.taxonomy ?? loadDestinationTaxonomy(destinationId);
}
