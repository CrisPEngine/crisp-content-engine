import 'server-only';

import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { getNativeContentStore } from '@/lib/media/store';
import { buildAgentThreadsPayload, resolveAgentThreadsAttachedImageUrl } from '@/lib/publish/agentThreadsJob';

function isPublicHttpsUrl(url: string): boolean {
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

export type ApprovalPublishImagePreview = {
	url: string;
	altText?: string;
	label: string;
};

async function resolveFirstLinkedImageAsset(
	ownerUserId: string,
	targetType: 'content' | 'article',
	targetId: string,
): Promise<{ url: string; altText?: string } | null> {
	const store = getNativeContentStore();
	const links = await store.listLinks(ownerUserId, targetType, targetId);
	for (const link of links) {
		const asset = await store.getAsset(ownerUserId, link.assetId);
		if (asset?.assetType !== 'image') continue;
		const url = asset.url?.trim();
		if (url && isPublicHttpsUrl(url)) {
			return { url, altText: asset.altText ?? asset.title ?? undefined };
		}
	}
	return null;
}

/** Image URL shown on the human approval page — matches Threads publish resolution when applicable. */
export async function resolveApprovalPublishImagePreview(input: {
	ownerUserId: string;
	targetType: 'content' | 'article';
	targetId: string;
	channel?: string | null;
	metadata?: Record<string, unknown> | null;
}): Promise<ApprovalPublishImagePreview | null> {
	if (input.targetType === 'article') {
		const linked = await resolveFirstLinkedImageAsset(input.ownerUserId, 'article', input.targetId);
		if (!linked) return null;
		return { ...linked, label: 'Attached image' };
	}

	const channel = String(input.channel ?? '').toLowerCase();
	if (channel === 'threads') {
		const attachedUrl = await resolveAgentThreadsAttachedImageUrl(input.ownerUserId, input.targetId);
		const memoryStub = {
			channel: 'threads',
			body: '',
			metadata: input.metadata ?? {},
		} as Pick<ContentMemoryRecord, 'channel' | 'body' | 'metadata'>;
		const payload = buildAgentThreadsPayload(
			memoryStub as ContentMemoryRecord,
			'preview',
			undefined,
			attachedUrl,
		);
		if (!payload.imageUrl) return null;
		const linked = await resolveFirstLinkedImageAsset(input.ownerUserId, 'content', input.targetId);
		const altText = linked?.url === payload.imageUrl ? linked.altText : undefined;
		return { url: payload.imageUrl, altText, label: 'Image that will be posted' };
	}

	const linked = await resolveFirstLinkedImageAsset(input.ownerUserId, 'content', input.targetId);
	if (!linked) return null;
	return { ...linked, label: 'Attached image' };
}
