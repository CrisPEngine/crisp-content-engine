import { describe, expect, it, beforeEach } from 'vitest';
import { resolveMediaForGeneratedContent } from '@/lib/media/autoAttachMedia';
import { createMemoryNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { FOLIAN_USER_ID } from '@/lib/intelligence/__tests__/folianFixture';
import { FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';

describe('resolveMediaForGeneratedContent', () => {
	beforeEach(() => {
		setNativeContentStoreForTests(createMemoryNativeContentStore());
		setIntelligenceStoreForTests(createMemoryIntelligenceStore());
	});

	it('does not attach or generate media for Threads text-first posts unless requested', async () => {
		const result = await resolveMediaForGeneratedContent({
			ctx: {
				credential: {
					id: 'cred',
					ownerUserId: FOLIAN_USER_ID,
					rateLimit: FOLIAN_GROK_RATE_LIMIT,
				},
			},
			brandId: 'brand-1',
			contentId: 'content-1',
			channel: 'THREADS',
			topic: 'Why autocomplete fails a novel',
			allowGenerate: true,
			allowAutoAttach: false,
		});
		expect(result.mediaPath).toBe('none');
		expect(result.mediaPlan.mediaRole).toBe('NONE');
	});
});
