export type LegacyProfileRef = {
	id: string;
	clientName: string;
	ownerUserId: string;
};

export type ReconciliationDecision = {
	selectedId: string;
	retainedIds: string[];
	reason: string;
};

function sameName(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Choose one Airtable BrandProfile as the compatibility record for a native brand.
 * Same-name profiles with different owners are refused. Same-owner duplicates require
 * an explicit selection and are retained, not deleted.
 */
export function reconcileLegacyProfiles(input: {
	expectedOwnerUserId: string;
	profiles: LegacyProfileRef[];
	selectedId: string;
	reason: string;
}): ReconciliationDecision {
	const selected = input.profiles.find((profile) => profile.id === input.selectedId);
	if (!selected) {
		throw new Error('Selected Airtable record is not in the candidate set.');
	}
	if (selected.ownerUserId !== input.expectedOwnerUserId) {
		throw new Error('Selected Airtable record is not owned by the expected CCE user.');
	}
	const named = input.profiles.filter((profile) => sameName(profile.clientName, selected.clientName));
	const otherOwner = named.find((profile) => profile.ownerUserId !== input.expectedOwnerUserId);
	if (otherOwner) {
		throw new Error('A same-name BrandProfile belongs to a different CCE user. Activation stopped.');
	}
	if (named.length > 1 && !input.reason.trim()) {
		throw new Error('Duplicate BrandProfiles require an explicit reconciliation reason.');
	}
	return {
		selectedId: selected.id,
		retainedIds: named.map((profile) => profile.id),
		reason: input.reason.trim(),
	};
}

export type QueueMemoryInput = {
	id: string;
	platform?: string;
	status?: string;
	hook?: string;
	body?: string;
	createdTime?: string;
};

export function queuePublicationStatus(status: string | undefined): 'published' | 'scheduled' | 'review' | 'draft' {
	const value = (status ?? '').toLowerCase();
	if (value.includes('published')) return 'published';
	if (value.includes('scheduled')) return 'scheduled';
	if (value.includes('approval')) return 'review';
	return 'draft';
}

export function queueChannel(platform: string | undefined): string {
	const value = (platform ?? '').trim().toLowerCase();
	if (!value || value.includes(',')) return 'other';
	if (value.includes('linkedin')) return 'linkedin';
	if (value === 'x' || value.includes('twitter')) return 'x';
	if (value.includes('instagram')) return 'instagram';
	if (value.includes('facebook')) return 'facebook';
	if (value.includes('blog') || value.includes('medium')) return value.includes('medium') ? 'other' : 'blog';
	return 'other';
}

export function memoryFromQueueItem(item: QueueMemoryInput): {
	airtableContentId: string;
	channel: string;
	hook?: string;
	body?: string;
	topic?: string;
	publicationStatus: string;
	metadata: Record<string, unknown>;
} | null {
	const hook = item.hook?.trim();
	const body = item.body?.trim();
	if (!hook && !body) return null;
	return {
		airtableContentId: item.id,
		channel: queueChannel(item.platform),
		hook: hook || undefined,
		body: body || undefined,
		topic: hook || undefined,
		publicationStatus: queuePublicationStatus(item.status),
		metadata: {
			source: 'airtable_content_queue',
			airtableRecordId: item.id,
			queueStatus: item.status ?? null,
			platform: item.platform ?? null,
			createdTime: item.createdTime ?? null,
			performance: 'insufficient',
		},
	};
}
