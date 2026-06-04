import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listRecords, getRecord } from '@/lib/airtable/client';
import {
	assertRecordAccessible,
	brandNameAllowedByPolicy,
	buildAllowlistFilterFormula,
	buildBrandListFilterFormula,
	parseBrandAllowlist,
	resetBrandAccessProbeCache,
	resolveBrandAccessPolicy,
	type BrandAccessPolicy,
} from '../brandAccess';
import { listSidecarBrands, resolveBrandProfile } from '../brands';
import { SidecarError } from '../errors';

vi.mock('@/lib/airtable/client', () => ({
	listRecords: vi.fn(),
	getRecord: vi.fn(),
}));

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function userIdPolicy(allowlist: string[] = [], enforceAllowlist = false): BrandAccessPolicy {
	const normalized =
		allowlist.length > 0 ? new Set(allowlist.map((n) => n.toLowerCase())) : null;
	return {
		mode: 'user_id',
		ownerUserId: OWNER,
		allowlistNames: allowlist,
		allowlistNormalized: normalized,
		enforceAllowlist,
	};
}

function allowlistPolicy(names: string[]): BrandAccessPolicy {
	return {
		mode: 'allowlist_only',
		ownerUserId: OWNER,
		allowlistNames: names,
		allowlistNormalized: new Set(names.map((n) => n.toLowerCase())),
		enforceAllowlist: true,
	};
}

function brandRecord(id: string, clientName: string, userId?: string) {
	return {
		id,
		fields: {
			client_name: clientName,
			status: 'New Brief',
			user_id: userId ?? OWNER,
		},
	};
}

describe('parseBrandAllowlist', () => {
	afterEach(() => {
		delete process.env.SIDECAR_BRAND_ALLOWLIST;
	});

	it('trims entries and builds case-insensitive set', () => {
		process.env.SIDECAR_BRAND_ALLOWLIST = '  CrisP Digital , Other Brand  ';
		const parsed = parseBrandAllowlist();
		expect(parsed.names).toEqual(['CrisP Digital', 'Other Brand']);
		expect(parsed.normalized?.has('crisp digital')).toBe(true);
		expect(parsed.normalized?.has('other brand')).toBe(true);
	});

	it('returns empty when unset', () => {
		expect(parseBrandAllowlist().names).toEqual([]);
		expect(parseBrandAllowlist().normalized).toBeNull();
	});
});

describe('buildBrandListFilterFormula', () => {
	it('filters by user_id for owner', () => {
		const formula = buildBrandListFilterFormula(userIdPolicy());
		expect(formula).toContain('{user_id}');
		expect(formula).toContain(OWNER);
	});

	it('combines user_id and allowlist only when enforceAllowlist is set', () => {
		const formula = buildBrandListFilterFormula(userIdPolicy(['My Brand'], true));
		expect(formula).toMatch(/^AND\(/);
		expect(formula).toContain('LOWER({client_name})');
	});

	it('does not combine allowlist in user_id mode unless enforceAllowlist', () => {
		const formula = buildBrandListFilterFormula(userIdPolicy(['My Brand']));
		expect(formula).not.toContain('OR(');
		expect(formula).toContain(OWNER);
	});

	it('uses allowlist OR for allowlist_only mode', () => {
		const formula = buildBrandListFilterFormula(allowlistPolicy(['A', 'B']));
		expect(formula).toBe('OR(LOWER({client_name})="a",LOWER({client_name})="b")');
	});
});

describe('assertRecordAccessible', () => {
	it('allows owned brand under user_id mode', () => {
		expect(() =>
			assertRecordAccessible(userIdPolicy(), brandRecord('rec1', 'Mine')),
		).not.toThrow();
	});

	it('rejects brand owned by another user', () => {
		expect(() =>
			assertRecordAccessible(
				userIdPolicy(),
				brandRecord('rec2', 'Client X', OTHER),
			),
		).toThrow(
			expect.objectContaining({
				code: 'sidecar_brand_forbidden',
				status: 403,
			}),
		);
	});

	it('allows brand outside allowlist in user_id mode when allowlist is not enforced', () => {
		expect(() =>
			assertRecordAccessible(
				userIdPolicy(['Allowed Only']),
				brandRecord('rec3', 'Other Brand'),
			),
		).not.toThrow();
	});

	it('rejects brand not on allowlist when enforceAllowlist is set', () => {
		expect(() =>
			assertRecordAccessible(
				userIdPolicy(['Allowed Only'], true),
				brandRecord('rec3', 'Other Brand'),
			),
		).toThrow(
			expect.objectContaining({
				code: 'sidecar_brand_not_allowed',
			}),
		);
	});

	it('allowlist_only permits only listed client_name', () => {
		expect(() =>
			assertRecordAccessible(
				allowlistPolicy(['Listed Brand']),
				brandRecord('rec4', 'Listed Brand', OTHER),
			),
		).not.toThrow();
		expect(() =>
			assertRecordAccessible(
				allowlistPolicy(['Listed Brand']),
				brandRecord('rec5', 'Not Listed', OTHER),
			),
		).toThrow();
	});
});

describe('brandNameAllowedByPolicy', () => {
	it('matches allowlist case-insensitively', () => {
		const policy = allowlistPolicy(['CrisP Digital']);
		expect(brandNameAllowedByPolicy(policy, 'crisp digital')).toBe(true);
		expect(brandNameAllowedByPolicy(policy, 'Other')).toBe(false);
	});
});

describe('resolveBrandAccessPolicy', () => {
	const table = 'tblBrandProfiles';

	beforeEach(() => {
		vi.mocked(listRecords).mockReset();
		resetBrandAccessProbeCache();
		process.env.AIRTABLE_BRANDPROFILES_TABLE = table;
		delete process.env.SIDECAR_BRAND_ALLOWLIST;
		delete process.env.SIDECAR_BRAND_USER_ID_FIELD;
	});

	afterEach(() => {
		resetBrandAccessProbeCache();
		delete process.env.AIRTABLE_BRANDPROFILES_TABLE;
		delete process.env.SIDECAR_BRAND_ALLOWLIST;
		delete process.env.SIDECAR_BRAND_USER_ID_FIELD;
	});

	it('uses user_id mode when probe succeeds', async () => {
		vi.mocked(listRecords).mockResolvedValueOnce([]);
		const policy = await resolveBrandAccessPolicy(OWNER);
		expect(policy.mode).toBe('user_id');
	});

	it('throws sidecar_brand_access_not_configured when user_id missing and no allowlist', async () => {
		vi.mocked(listRecords).mockRejectedValueOnce(
			new Error('Airtable API error: 422 - {"error":{"type":"UNKNOWN_FIELD_NAME","message":"user_id"}}'),
		);
		await expect(resolveBrandAccessPolicy(OWNER)).rejects.toMatchObject({
			code: 'sidecar_brand_access_not_configured',
			status: 503,
		});
	});

	it('falls back to allowlist_only when user_id missing and allowlist set', async () => {
		vi.mocked(listRecords).mockRejectedValueOnce(
			new Error('UNKNOWN_FIELD_NAME user_id'),
		);
		process.env.SIDECAR_BRAND_ALLOWLIST = 'Only Brand';
		const policy = await resolveBrandAccessPolicy(OWNER);
		expect(policy.mode).toBe('allowlist_only');
		expect(policy.allowlistNames).toEqual(['Only Brand']);
	});
});

describe('listSidecarBrands', () => {
	const table = 'tblBrandProfiles';

	beforeEach(() => {
		vi.mocked(listRecords).mockReset();
		resetBrandAccessProbeCache();
		process.env.AIRTABLE_BRANDPROFILES_TABLE = table;
		process.env.SIDECAR_BRAND_USER_ID_FIELD = 'false';
		process.env.SIDECAR_BRAND_ALLOWLIST = 'Mine Only';
	});

	afterEach(() => {
		resetBrandAccessProbeCache();
		delete process.env.AIRTABLE_BRANDPROFILES_TABLE;
		delete process.env.SIDECAR_BRAND_ALLOWLIST;
		delete process.env.SIDECAR_BRAND_USER_ID_FIELD;
	});

	it('returns only allowlisted brands (not entire table)', async () => {
		vi.mocked(listRecords).mockResolvedValueOnce([
			brandRecord('recA', 'Mine Only'),
			brandRecord('recB', 'Client Secret', OTHER),
		]);

		const { brands, meta } = await listSidecarBrands(OWNER);
		expect(brands).toHaveLength(1);
		expect(brands[0]?.name).toBe('Mine Only');
		expect(meta.accessMode).toBe('allowlist_only');
		expect(meta.allowlistActive).toBe(true);
	});

	it('returns only owned brands when user_id filter is active', async () => {
		delete process.env.SIDECAR_BRAND_USER_ID_FIELD;
		delete process.env.SIDECAR_BRAND_ALLOWLIST;
		resetBrandAccessProbeCache();

		vi.mocked(listRecords)
			.mockResolvedValueOnce([]) // probe
			.mockResolvedValueOnce([
				brandRecord('recOwned', 'Owned Brand', OWNER),
				brandRecord('recOther', 'Other Client', OTHER),
			]);

		const { brands, meta } = await listSidecarBrands(OWNER);
		expect(brands).toHaveLength(1);
		expect(brands[0]?.name).toBe('Owned Brand');
		expect(meta.userFilterActive).toBe(true);
		expect(meta.accessMode).toBe('user_id');
	});
});

describe('resolveBrandProfile (draft / save)', () => {
	const table = 'tblBrandProfiles';

	beforeEach(() => {
		vi.mocked(listRecords).mockReset();
		vi.mocked(getRecord).mockReset();
		resetBrandAccessProbeCache();
		process.env.AIRTABLE_BRANDPROFILES_TABLE = table;
		process.env.SIDECAR_BRAND_USER_ID_FIELD = 'false';
		process.env.SIDECAR_BRAND_ALLOWLIST = 'Allowed Brand';
		vi.mocked(listRecords).mockRejectedValue(
			new Error('UNKNOWN_FIELD_NAME user_id'),
		);
	});

	afterEach(() => {
		resetBrandAccessProbeCache();
		delete process.env.AIRTABLE_BRANDPROFILES_TABLE;
		delete process.env.SIDECAR_BRAND_ALLOWLIST;
		delete process.env.SIDECAR_BRAND_USER_ID_FIELD;
	});

	it('rejects inaccessible brandId', async () => {
		vi.mocked(getRecord).mockResolvedValue({
			id: 'recForbidden',
			fields: { client_name: 'Not On Allowlist', status: 'New Brief' },
		});

		await expect(
			resolveBrandProfile({ ownerUserId: OWNER, brandId: 'recForbidden' }),
		).rejects.toMatchObject({ code: 'sidecar_brand_not_allowed', status: 403 });
	});

	it('rejects inaccessible brandName', async () => {
		await expect(
			resolveBrandProfile({ ownerUserId: OWNER, brandName: 'Competitor Brand' }),
		).rejects.toMatchObject({ code: 'sidecar_brand_not_allowed', status: 403 });
	});

	it('resolves allowed brand by name', async () => {
		vi.mocked(listRecords).mockImplementation(async (opts) => {
			const formula = opts?.filterByFormula ?? '';
			if (formula.includes('user_id') && !formula.includes('Allowed Brand')) {
				throw new Error('UNKNOWN_FIELD_NAME user_id');
			}
			if (formula.includes('allowed brand') || formula.includes('Allowed Brand')) {
				return [brandRecord('recOk', 'Allowed Brand')];
			}
			return [];
		});

		const profile = await resolveBrandProfile({
			ownerUserId: OWNER,
			brandName: 'allowed brand',
		});
		expect(profile.name).toBe('Allowed Brand');
	});
});
