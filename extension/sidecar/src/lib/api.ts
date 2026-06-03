import { classifyFetchError, SidecarApiError } from './errors';
import { isSettingsComplete, type SidecarSettings } from './settings';

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

export type BrandsMeta = {
	airtableCount: number;
	returnedCount: number;
	allowlistActive: boolean;
	userFilterActive: boolean;
	emptyReason?: string;
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

export type ConnectionTestResult = {
	config: SidecarConfig;
	brands: Brand[];
	brandsMeta: BrandsMeta;
};

type ApiEnvelope<T> = { ok: true } & T | { ok: false; error: string; code?: string; details?: unknown };

function requireSettings(settings: SidecarSettings): void {
	if (!isSettingsComplete(settings)) {
		throw new SidecarApiError('Configure CCE API URL and Bearer token in Settings first.', {
			kind: 'missing_settings',
		});
	}
}

async function requestWithSettings<T>(
	settings: SidecarSettings,
	path: string,
	init?: RequestInit,
): Promise<T> {
	requireSettings(settings);

	const base = settings.apiBaseUrl.trim().replace(/\/$/, '');
	const url = `${base}${path}`;

	let res: Response;
	try {
		res = await fetch(url, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${settings.apiToken.trim()}`,
				...(init?.headers || {}),
			},
		});
	} catch (error) {
		throw classifyFetchError(error);
	}

	const data = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & Record<string, unknown>;
	const code = typeof data.code === 'string' ? data.code : undefined;

	if (!res.ok || data.ok === false) {
		const message =
			data.ok === false && typeof data.error === 'string'
				? data.error
				: `Request failed (${res.status})`;
		throw classifyFetchError(new Error(message), res.status, code);
	}

	const { ok: _ok, ...rest } = data;
	return rest as T;
}

export async function testConnection(settings: SidecarSettings): Promise<ConnectionTestResult> {
	const [config, brandsResult] = await Promise.all([
		requestWithSettings<SidecarConfig>(settings, '/api/sidecar/config'),
		requestWithSettings<{ brands: Brand[]; meta: BrandsMeta }>(settings, '/api/sidecar/brands'),
	]);
	return {
		config,
		brands: brandsResult.brands ?? [],
		brandsMeta: brandsResult.meta ?? {
			airtableCount: 0,
			returnedCount: brandsResult.brands?.length ?? 0,
			allowlistActive: false,
			userFilterActive: false,
		},
	};
}

export async function fetchConfig(settings: SidecarSettings): Promise<SidecarConfig> {
	return requestWithSettings<SidecarConfig>(settings, '/api/sidecar/config');
}

export async function fetchBrands(
	settings: SidecarSettings,
): Promise<{ brands: Brand[]; meta: BrandsMeta }> {
	return requestWithSettings<{ brands: Brand[]; meta: BrandsMeta }>(settings, '/api/sidecar/brands');
}

export async function generateDraft(
	settings: SidecarSettings,
	body: Record<string, unknown>,
): Promise<DraftResult> {
	return requestWithSettings<DraftResult>(settings, '/api/sidecar/draft', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function saveOpportunity(
	settings: SidecarSettings,
	body: Record<string, unknown>,
): Promise<{ id: string }> {
	return requestWithSettings<{ id: string }>(settings, '/api/sidecar/opportunity', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function saveContact(
	settings: SidecarSettings,
	body: Record<string, unknown>,
): Promise<{ id: string; updated: boolean }> {
	return requestWithSettings<{ id: string; updated: boolean }>(settings, '/api/sidecar/contact', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function createContentIdea(
	settings: SidecarSettings,
	body: Record<string, unknown>,
): Promise<{ airtableRecordId: string }> {
	return requestWithSettings<{ airtableRecordId: string }>(settings, '/api/sidecar/content-idea', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}
