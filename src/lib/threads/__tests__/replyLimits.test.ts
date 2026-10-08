import { describe, expect, it } from 'vitest';
import { countPublishedRepliesToday, findDuplicateReplyTarget, threadsRepliesDailyCap } from '../replyLimits';
import type { CommunityInteraction } from '@/lib/agent/types';

function interaction(partial: Partial<CommunityInteraction> & Pick<CommunityInteraction, 'id' | 'brandId'>): CommunityInteraction {
	return {
		platform: 'threads',
		type: 'reply_draft',
		responseStatus: 'drafted',
		createdAt: new Date().toISOString(),
		...partial,
	};
}

describe('threads reply limits', () => {
	it('counts published replies for the current UTC day', () => {
		const now = new Date('2026-10-08T12:00:00.000Z');
		const rows = [
			interaction({
				id: '1',
				brandId: 'b',
				responseStatus: 'published',
				publishedAt: '2026-10-08T10:00:00.000Z',
			}),
			interaction({
				id: '2',
				brandId: 'b',
				responseStatus: 'published',
				publishedAt: '2026-10-07T10:00:00.000Z',
			}),
		];
		expect(countPublishedRepliesToday(rows, now)).toBe(1);
	});

	it('detects duplicate targets awaiting approval', () => {
		const rows = [
			interaction({
				id: '1',
				brandId: 'b',
				resolvedMediaId: '999',
				responseStatus: 'awaiting_approval',
			}),
		];
		const dup = findDuplicateReplyTarget(rows, {
			id: '2',
			brandId: 'b',
			resolvedMediaId: '999',
		});
		expect(dup?.id).toBe('1');
	});

	it('uses default caps', () => {
		expect(threadsRepliesDailyCap(false)).toBe(30);
		expect(threadsRepliesDailyCap(true)).toBe(100);
	});
});
