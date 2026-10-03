import 'server-only';

import { getLinkedInConnectionByBrand } from '@/lib/linkedin/publish';
import { snapshotFromManualMetrics } from './metrics';
import { deriveRates } from '../performance';
import type { IntelligenceStore } from '../store';
import type { ContentMemoryRecord, PerformanceSnapshot } from '../types';

type LinkedInStats = {
	impressions?: number;
	clicks?: number;
	reactions?: number;
	comments?: number;
	shares?: number;
	engagementRate?: number;
	clickThroughRate?: number;
	raw: Record<string, unknown>;
	source: 'api' | 'manual';
};

function isConnectionError(value: unknown): value is { error: string } {
	return Boolean(value && typeof value === 'object' && 'error' in value);
}

async function fetchJson(url: string, accessToken: string): Promise<{ ok: boolean; status: number; body: unknown }> {
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'X-Restli-Protocol-Version': '2.0.0',
			'LinkedIn-Version': '202401',
		},
	});
	const body = await response.json().catch(() => ({}));
	return { ok: response.ok, status: response.status, body };
}

export async function fetchLinkedInPostStats(input: {
	accessToken: string;
	postUrn: string;
	organizationUrn?: string;
}): Promise<LinkedInStats | { error: string; status?: number }> {
	const encoded = encodeURIComponent(input.postUrn);
	const social = await fetchJson(`https://api.linkedin.com/v2/socialActions/${encoded}`, input.accessToken);
	if (social.ok && social.body && typeof social.body === 'object') {
		const body = social.body as Record<string, unknown>;
		const likes = (body.likesSummary as { totalLikes?: number } | undefined)?.totalLikes;
		const comments = (body.commentsSummary as { aggregatedTotalComments?: number; totalFirstLevelComments?: number } | undefined)
			?.aggregatedTotalComments ?? (body.commentsSummary as { totalFirstLevelComments?: number } | undefined)?.totalFirstLevelComments;
		return {
			reactions: likes,
			comments,
			raw: body,
			source: 'api',
		};
	}

	if (input.organizationUrn) {
		const org = encodeURIComponent(input.organizationUrn);
		const share = encodeURIComponent(input.postUrn.replace('urn:li:ugcPost:', 'urn:li:share:'));
		const stats = await fetchJson(
			`https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&shares[0]=${share}`,
			input.accessToken,
		);
		if (stats.ok && stats.body && typeof stats.body === 'object') {
			const elements = (stats.body as { elements?: Array<Record<string, unknown>> }).elements ?? [];
			const total = (elements[0]?.totalShareStatistics as Record<string, number> | undefined) || {};
			const impressions = total.impressionCount;
			const clicks = total.clickCount;
			const reactions = total.likeCount;
			const comments = total.commentCount;
			const shares = total.shareCount;
			const rates = deriveRates({ impressions, clicks, reactions, comments, shares });
			return {
				impressions,
				clicks,
				reactions,
				comments,
				shares,
				...rates,
				raw: stats.body as Record<string, unknown>,
				source: 'api',
			};
		}
	}

	return {
		error: `LinkedIn analytics unavailable (${social.status}). Company-page stats often need r_organization_social. Manual ingest is supported.`,
		status: social.status,
	};
}

export { snapshotFromManualMetrics };

export async function ingestLinkedInForMemory(
	store: IntelligenceStore,
	userId: string,
	brainId: string,
	memory: ContentMemoryRecord,
	airtableBrandId: string,
): Promise<{ snapshot?: PerformanceSnapshot & { brandBrainId: string }; warning?: string }> {
	const postId = memory.externalPostId || (memory.metadata?.linkedin_post_id as string | undefined);
	if (!postId) {
		return { warning: 'No LinkedIn post id on this memory row' };
	}

	const connection = await getLinkedInConnectionByBrand(airtableBrandId);
	if (!connection || isConnectionError(connection)) {
		return { warning: 'No usable LinkedIn connection for analytics' };
	}

	const stats = await fetchLinkedInPostStats({
		accessToken: connection.accessToken,
		postUrn: postId.startsWith('urn:') ? postId : `urn:li:ugcPost:${postId}`,
		organizationUrn: connection.organizationUrn,
	});

	if ('error' in stats) {
		return { warning: stats.error };
	}

	const hoursSincePublish = memory.publicationDate
		? (Date.now() - new Date(memory.publicationDate).getTime()) / 3_600_000
		: undefined;

	const snapshot = await store.savePerformance(userId, {
		...snapshotFromManualMetrics({
			channel: 'linkedin',
			memoryId: memory.id,
			hoursSincePublish,
			impressions: stats.impressions,
			clicks: stats.clicks,
			reactions: stats.reactions,
			comments: stats.comments,
			shares: stats.shares,
		}),
		brandBrainId: brainId,
	});

	console.info('[analytics:linkedin]', {
		memory_id: memory.id,
		source: stats.source,
		impressions: stats.impressions,
		comments: stats.comments,
	});

	return { snapshot: { ...snapshot, brandBrainId: brainId } };
}

export async function ingestBrandLinkedInAnalytics(
	store: IntelligenceStore,
	userId: string,
	airtableBrandId: string,
	memoryId?: string,
): Promise<{ ingested: number; warnings: Array<{ id: string; warning: string }> }> {
	const brain = await store.getBrandBrain(userId, airtableBrandId);
	if (!brain) throw new Error('Brand brain not found');
	const rows = await store.listMemory(userId, brain.id);
	const published = rows.filter(
		(row) =>
			row.channel === 'linkedin' &&
			row.publicationStatus === 'published' &&
			(row.externalPostId || row.metadata?.linkedin_post_id),
	);
	const targets = memoryId ? published.filter((row) => row.id === memoryId) : published.slice(0, 25);
	const warnings: Array<{ id: string; warning: string }> = [];
	let ingested = 0;
	for (const row of targets) {
		const result = await ingestLinkedInForMemory(store, userId, brain.id, row, airtableBrandId);
		if (result.snapshot) ingested += 1;
		if (result.warning) warnings.push({ id: row.id, warning: result.warning });
	}
	return { ingested, warnings };
}
