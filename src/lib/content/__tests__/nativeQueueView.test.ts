import { describe, expect, it } from 'vitest';
import type { BrandBrain } from '@/lib/intelligence/types';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { brainMatchesBrandFilter } from '@/lib/content/brandFilter';
import {
	channelDisplayPlatform,
	isScheduledOverdue,
	mapMemoryToQueueItem,
	matchesPlatformTab,
	stageIncludesWorkflowStatus,
	uiStatusLabel,
} from '@/lib/content/nativeQueueView';

const folianBrain: BrandBrain = {
	id: '03cba45a-6faf-4b6c-a20b-2c2496318b58',
	userId: 'user-1',
	airtableBrandId: '',
	identity: { name: 'Folian' },
	voice: {},
	guardrails: {},
	knowledge: {},
	examples: [],
	updatedAt: '',
};

describe('nativeQueueView', () => {
	it('matches CCE brand id for Folian', () => {
		expect(brainMatchesBrandFilter(folianBrain, '03cba45a-6faf-4b6c-a20b-2c2496318b58')).toBe(true);
		expect(brainMatchesBrandFilter(folianBrain, 'recOther')).toBe(false);
	});

	it('maps channels to display platforms', () => {
		expect(channelDisplayPlatform('instagram')).toBe('Instagram');
		expect(channelDisplayPlatform('threads')).toBe('Threads');
	});

	it('filters Meta tab to instagram and facebook', () => {
		expect(matchesPlatformTab('instagram', 'Meta')).toBe(true);
		expect(matchesPlatformTab('linkedin', 'Meta')).toBe(false);
	});

	it('flags overdue scheduled content', () => {
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: folianBrain.id,
			channel: 'instagram',
			body: 'Caption',
			publicationStatus: 'scheduled',
			publicationDate: '2020-01-01T12:00:00.000Z',
			createdAt: '2020-01-01T00:00:00.000Z',
		};
		expect(isScheduledOverdue(memory)).toBe(true);
		expect(
			uiStatusLabel('SCHEDULED', { overdue: true, publishJobStatus: null }),
		).toBe('Overdue');
	});

	it('includes scheduled items on schedule stage', () => {
		expect(stageIncludesWorkflowStatus('schedule', 'SCHEDULED')).toBe(true);
		expect(stageIncludesWorkflowStatus('published', 'SCHEDULED')).toBe(false);
	});

	it('maps memory to queue item with publish diagnostics', () => {
		const memory: ContentMemoryRecord = {
			id: 'f1f6d564',
			userId: 'user-1',
			brandBrainId: folianBrain.id,
			channel: 'instagram',
			hook: 'Hook',
			body: 'Body',
			publicationStatus: 'scheduled',
			publicationDate: '2026-10-09T15:30:00.000Z',
			createdAt: '2026-10-07T00:00:00.000Z',
		};
		const item = mapMemoryToQueueItem(folianBrain, memory, {
			lastPublishError: 'Instagram requires an image',
			publishJobStatus: 'failed',
		});
		expect(item.platform).toBe('Instagram');
		expect(item.brand_profile_id).toBe(folianBrain.id);
		expect(item.last_publish_error).toContain('image');
	});
});
