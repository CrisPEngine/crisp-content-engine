import { describe, expect, it } from 'vitest';
import {
	contentApprovalHref,
	hrefWithWorkingBrand,
	intelligenceStrategyHref,
	readApprovalBrandFromSearch,
	resolveWorkingBrandId,
} from '../workingBrand';

describe('workingBrand helpers', () => {
	it('builds content approval href with brand query param', () => {
		expect(contentApprovalHref('recABC')).toBe('/content/approval?brand=recABC');
		expect(contentApprovalHref('all')).toBe('/content/approval');
		expect(contentApprovalHref(null)).toBe('/content/approval');
	});

	it('reads approval brand from brand or brand_profile_id', () => {
		expect(readApprovalBrandFromSearch(new URLSearchParams('brand=rec1'))).toBe('rec1');
		expect(readApprovalBrandFromSearch(new URLSearchParams('brand_profile_id=rec2'))).toBe('rec2');
		expect(readApprovalBrandFromSearch(new URLSearchParams('brand=rec1&brand_profile_id=rec2'))).toBe('rec1');
	});

	it('hrefWithWorkingBrand scopes approval and intelligence paths', () => {
		expect(hrefWithWorkingBrand('/content/approval', 'recX')).toBe('/content/approval?brand=recX');
		expect(hrefWithWorkingBrand('/intelligence', 'recX')).toBe(intelligenceStrategyHref('recX'));
	});

	it('resolveWorkingBrandId prefers URL over fallback', () => {
		const ids = ['a', 'b', 'c'];
		expect(resolveWorkingBrandId(new URLSearchParams('brand=b'), ids, 'a')).toBe('b');
		expect(resolveWorkingBrandId(new URLSearchParams('brand_profile_id=c'), ids, 'a')).toBe('c');
		expect(resolveWorkingBrandId(new URLSearchParams(), ids, 'a')).toBe('a');
	});
});
