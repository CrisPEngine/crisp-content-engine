import 'server-only';

import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import { destinationFetch } from '../ssrf';
import type { DestinationAdapter, DestinationConnection } from '../types';

function headers(connection: DestinationConnection, json = false): Record<string, string> {
	if (!connection.credentials.apiKey) throw new Error('This destination has no API key.');
	return {
		Authorization: `Bearer ${connection.credentials.apiKey}`,
		...(json ? { 'Content-Type': 'application/json' } : {}),
		...(connection.credentials.bypassToken ? { 'x-vercel-protection-bypass': connection.credentials.bypassToken } : {}),
	};
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function errorFrom(payload: Record<string, unknown>, fallback: string): string {
	return String(payload.message ?? payload.error ?? payload.code ?? fallback);
}

function endpoint(connection: DestinationConnection, path: string): string {
	return `${connection.baseUrl}/api/content/v1${path}`;
}

/** Payload CMS content API (`/api/content/v1`). Folian is the first site using it. */
export const payloadContentApiAdapter: DestinationAdapter = {
	async testConnection(connection) {
		const started = Date.now();
		try {
			const response = await destinationFetch(endpoint(connection, '/taxonomy'), { headers: headers(connection, true) });
			const latencyMs = Date.now() - started;
			if (response.status === 401 || response.status === 403) return { ok: false, message: 'The CMS rejected the API key.', latencyMs };
			const payload = await readJson(response);
			if (!response.ok) return { ok: false, message: errorFrom(payload, `The CMS returned ${response.status}.`), latencyMs };
			const categories = Array.isArray(payload.categories) ? payload.categories.length : 0;
			return { ok: true, message: `Connected. The CMS returned ${categories} categor${categories === 1 ? 'y' : 'ies'}.`, latencyMs };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : 'Connection failed.', latencyMs: Date.now() - started };
		}
	},

	async fetchTaxonomy(connection) {
		const response = await destinationFetch(endpoint(connection, '/taxonomy'), { headers: headers(connection, true) });
		const payload = await readJson(response);
		if (!response.ok) throw new Error(errorFrom(payload, `Taxonomy request failed (${response.status}).`));
		const taxonomy = payload as unknown as DestinationTaxonomy & { ok?: boolean };
		if (!Array.isArray(taxonomy.categories)) throw new Error('The CMS taxonomy response has no categories.');
		return {
			destination: connection.destination.key,
			schemaVersion: Number(taxonomy.schemaVersion ?? 1),
			categoryCreationPolicy: taxonomy.categoryCreationPolicy === 'open' ? 'open' : 'closed',
			categories: taxonomy.categories.map((category) => ({
				id: String(category.id),
				name: String(category.name ?? category.id),
				description: String(category.description ?? ''),
				journey: Array.isArray(category.journey) ? category.journey.map(String) : undefined,
			})),
			contentTypes: Array.isArray(taxonomy.contentTypes) ? taxonomy.contentTypes.map(String) : [],
			tags: taxonomy.tags ?? { policy: 'open' },
			tools: Array.isArray(taxonomy.tools) ? taxonomy.tools : [],
			requiredMetadata: taxonomy.requiredMetadata,
		};
	},

	async lookupDraft(connection, externalId) {
		const response = await destinationFetch(endpoint(connection, `/drafts/${encodeURIComponent(externalId)}`), { headers: headers(connection, true) });
		if (response.status === 404) return { exists: false };
		const payload = await readJson(response);
		if (!response.ok) throw new Error(errorFrom(payload, `Draft lookup failed (${response.status}).`));
		const draft = (payload.draft ?? payload) as Record<string, unknown>;
		if (typeof draft.revision !== 'number') throw new Error('The CMS draft has no revision number, so it cannot be updated safely.');
		return {
			exists: true,
			revision: draft.revision,
			status: String(draft.status ?? 'unknown'),
			title: String(draft.title ?? ''),
			category: typeof draft.category === 'string' ? draft.category : null,
			slug: typeof draft.slug === 'string' ? draft.slug : null,
		};
	},

	async submitDraft(connection, submission) {
		const response = await destinationFetch(endpoint(connection, `/drafts/${encodeURIComponent(submission.externalId)}`), {
			method: 'PUT',
			headers: headers(connection, true),
			body: JSON.stringify({ ...submission.payload, externalId: submission.externalId, baseRevision: submission.baseRevision, mode: submission.mode }),
			timeoutMs: 45_000,
		});
		const payload = await readJson(response);
		if (!response.ok) return { ok: false, error: errorFrom(payload, `The CMS returned ${response.status}.`) };
		return {
			ok: true,
			revision: typeof payload.revision === 'number' ? payload.revision : undefined,
			adminUrl: typeof payload.adminUrl === 'string' ? payload.adminUrl : undefined,
			previewUrl: typeof payload.previewUrl === 'string' ? payload.previewUrl : typeof payload.url === 'string' ? payload.url : undefined,
		};
	},

	async uploadMedia(connection, input) {
		const form = new FormData();
		form.set('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.filename);
		form.set('alt', input.alt);
		form.set('credit', input.credit);
		form.set('license', input.license);
		const response = await destinationFetch(endpoint(connection, '/media'), { method: 'POST', headers: headers(connection), body: form, timeoutMs: 45_000 });
		const payload = await readJson(response);
		if (!response.ok || !payload.mediaId) return { ok: false, error: errorFrom(payload, `Media upload failed (${response.status}).`) };
		return { ok: true, mediaId: String(payload.mediaId) };
	},
};
