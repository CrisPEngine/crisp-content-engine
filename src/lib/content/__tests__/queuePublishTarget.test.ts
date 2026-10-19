import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandBrain } from '@/lib/intelligence/types';

vi.mock('@/lib/social/resolveDestination', () => ({
	resolvePublishDestination: vi.fn(),
}));

import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { channelRequiresPublishDestination, resolveQueuePublishTarget } from '@/lib/content/queuePublishTarget';

const folianBrain: Pick<BrandBrain, 'id' | 'airtableBrandId'> = {
	id: '03cba45a-6faf-4b6c-a20b-2c2496318b58',
	airtableBrandId: 'recFolian',
};

describe('queuePublishTarget', () => {
	beforeEach(() => {
		vi.mocked(resolvePublishDestination).mockReset();
	});

	it('scopes Instagram destination to the brand brain id', async () => {
		vi.mocked(resolvePublishDestination).mockResolvedValue({
			source: 'native',
			channel: 'instagram',
			provider: 'meta',
			providerDestinationId: '2',
			displayName: 'Folian',
			handle: 'folian.app',
		});

		const target = await resolveQueuePublishTarget({
			userId: 'user-1',
			brandBrain: folianBrain,
			channel: 'instagram',
		});

		expect(resolvePublishDestination).toHaveBeenCalledWith({
			userId: 'user-1',
			airtableBrandId: 'recFolian',
			platform: 'Instagram',
		});
		expect(target.ready).toBe(true);
		expect(target.label).toBe('@folian.app');
	});

	it('does not leak another brand handle when destination is missing', async () => {
		vi.mocked(resolvePublishDestination).mockResolvedValue(null);

		const target = await resolveQueuePublishTarget({
			userId: 'user-1',
			brandBrain: folianBrain,
			channel: 'instagram',
		});

		expect(target.ready).toBe(false);
		expect(target.label).toBeNull();
	});

	it('does not require destination for Blog or X', () => {
		expect(channelRequiresPublishDestination('blog')).toBe(false);
		expect(channelRequiresPublishDestination('x')).toBe(false);
		expect(channelRequiresPublishDestination('instagram')).toBe(true);
	});

	it('resolves Instagram without requiring Facebook', async () => {
		vi.mocked(resolvePublishDestination).mockImplementation(async (input) => {
			if (input.platform === 'Instagram') {
				return {
					source: 'native',
					channel: 'instagram',
					provider: 'meta',
					providerDestinationId: 'ig',
					displayName: 'Folian',
					handle: 'folian.app',
				};
			}
			return null;
		});

		const instagram = await resolveQueuePublishTarget({
			userId: 'user-1',
			brandBrain: folianBrain,
			channel: 'instagram',
		});
		const facebook = await resolveQueuePublishTarget({
			userId: 'user-1',
			brandBrain: folianBrain,
			channel: 'facebook',
		});

		expect(instagram.ready).toBe(true);
		expect(facebook.ready).toBe(false);
	});
});
