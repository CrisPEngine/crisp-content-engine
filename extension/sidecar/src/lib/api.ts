import { loadSettings } from './settings';

export type SidecarConfig = {
	version: string;
	enums: {
		messageTypes: string[];
		objectives: string[];
		ctaStrengths: string[];
		relationshipStages: string[];
		contactTypes: string[];
		consentStatuses: string[];
	};
	features: {
		saveContacts: boolean;
		contentIdeas: boolean;
	};
};

export type Brand = {
	id: string;
	name: string;
	status: string;
};

export type DraftResult = {
	draftText: string;
	shortAlternative: string;
	fitScore: number;
	opportunitySummary: string;
	recommendedAction: string;
	ctaRecommendation: string;
	linkRecommendation: string;
	riskNotes: string;
	suggestedFollowUp: string;
	suggestedTags: string[];
	suggestedContentIdea?: {
		title: string;
		hook: string;
		angle: string;
		topicBucket: string;
	};
	brandId: string;
	brandName: string;
};

type ApiEnvelope<T> = { ok: true } & T | { ok: false; error: string; code?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const { apiBaseUrl, apiToken } = await loadSettings();
	const base = apiBaseUrl.replace(/\/$/, '');
	const url = `${base}${path}`;

	const res = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiToken}`,
			...(init?.headers || {}),
		},
	});

	const data = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & Record<string, unknown>;
	if (!res.ok || data.ok === false) {
		const message =
			data.ok === false && typeof data.error === 'string'
				? data.error
				: `Request failed (${res.status})`;
		throw new Error(message);
	}

	const { ok: _ok, ...rest } = data;
	return rest as T;
}

export async function fetchConfig(): Promise<SidecarConfig> {
	return request<SidecarConfig>('/api/sidecar/config');
}

export async function fetchBrands(): Promise<{ brands: Brand[] }> {
	return request<{ brands: Brand[] }>('/api/sidecar/brands');
}

export async function generateDraft(body: Record<string, unknown>): Promise<DraftResult> {
	return request<DraftResult>('/api/sidecar/draft', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function saveOpportunity(body: Record<string, unknown>): Promise<{ id: string }> {
	return request<{ id: string }>('/api/sidecar/opportunity', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function saveContact(body: Record<string, unknown>): Promise<{ id: string; updated: boolean }> {
	return request<{ id: string; updated: boolean }>('/api/sidecar/contact', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function createContentIdea(body: Record<string, unknown>): Promise<{ airtableRecordId: string }> {
	return request<{ airtableRecordId: string }>('/api/sidecar/content-idea', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}
