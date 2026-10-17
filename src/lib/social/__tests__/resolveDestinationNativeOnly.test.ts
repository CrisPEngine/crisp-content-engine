import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdmin = {
	from: vi.fn(),
};

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: () => mockAdmin,
}));

describe('resolvePublishDestination native-only guard', () => {
	beforeEach(() => {
		mockAdmin.from.mockReset();
	});

	it('does not fall back to legacy Meta when a brand brain exists without a mapping', async () => {
		const brandBrainId = 'brain-premium';
		const tables: Record<string, { select: ReturnType<typeof vi.fn> }> = {};

		const chain = (result: unknown) => ({
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: result }),
			select: vi.fn().mockReturnThis(),
		});

		mockAdmin.from.mockImplementation((table: string) => {
			if (table === 'brand_brains') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								maybeSingle: vi.fn().mockResolvedValue({ data: { id: brandBrainId } }),
							}),
							maybeSingle: vi.fn().mockResolvedValue({ data: { id: brandBrainId } }),
						}),
					}),
				};
			}
			if (table === 'brand_destinations') {
				return chain(null);
			}
			if (table === 'meta_pages') {
				return chain({ page_id: 'legacy-page', page_name: 'Other Brand Page' });
			}
			tables[table] = { select: vi.fn() };
			return chain(null);
		});

		const { resolvePublishDestination } = await import('@/lib/social/resolveDestination');
		const resolved = await resolvePublishDestination({
			userId: 'user-1',
			airtableBrandId: 'recPremium',
			platform: 'Facebook',
		});

		expect(resolved).toBeNull();
		expect(mockAdmin.from).not.toHaveBeenCalledWith('meta_pages');
	});
});
