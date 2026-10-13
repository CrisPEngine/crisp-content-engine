import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					eq: vi.fn(() => ({
						maybeSingle,
					})),
					maybeSingle,
				})),
			})),
		})),
	})),
}));

describe('resolveBrandBrainId', () => {
	beforeEach(() => {
		maybeSingle.mockReset();
	});

	it('resolves native brand brain id when airtable id is empty', async () => {
		maybeSingle
			.mockResolvedValueOnce({ data: null })
			.mockResolvedValueOnce({ data: { id: '03cba45a-6faf-4b6c-a20b-2c2496318b58' } });

		const { resolveBrandBrainId } = await import('@/lib/social/resolveDestination');
		const id = await resolveBrandBrainId('user-1', '03cba45a-6faf-4b6c-a20b-2c2496318b58');
		expect(id).toBe('03cba45a-6faf-4b6c-a20b-2c2496318b58');
	});
});
