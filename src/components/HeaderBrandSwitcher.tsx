'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hrefWithWorkingBrand, readWorkingBrandId, writeWorkingBrandId } from '@/lib/brands/workingBrand';

type BrandRow = { id: string; name: string };

export function HeaderBrandSwitcher({ variant = 'header' }: { variant?: 'header' | 'sidebar' } = {}) {
	const pathname = usePathname();
	const router = useRouter();
	const [brands, setBrands] = useState<BrandRow[]>([]);
	const [brainByAirtable, setBrainByAirtable] = useState<Record<string, string>>({});
	const [brandId, setBrandId] = useState('');
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [brandRes, socialRes] = await Promise.all([
				fetch('/api/brands', { cache: 'no-store' }),
				fetch('/api/social/connections?skipSync=1', { cache: 'no-store' }),
			]);
			const data = brandRes.ok
				? (await brandRes.json()) as { profiles?: Array<{ id: string; client_name?: string }> }
				: { profiles: [] };
			let rows: BrandRow[] = (data.profiles ?? []).map((row) => ({
				id: row.id,
				name: row.client_name || 'Unnamed brand',
			}));
			if (!rows.length) {
				const intelRes = await fetch('/api/intelligence/brands', { cache: 'no-store' });
				if (intelRes.ok) {
					const intel = (await intelRes.json()) as { brands?: Array<{ id: string; name?: string }> };
					rows = (intel.brands ?? []).map((row) => ({ id: row.id, name: row.name || 'Unnamed workspace' }));
				}
			}
			setBrands(rows);
			let brainMap: Record<string, string> = {};
			if (socialRes.ok) {
				const social = (await socialRes.json()) as {
					brands?: Array<{ id: string; airtableBrandId?: string }>;
				};
				for (const row of social.brands ?? []) {
					if (row.airtableBrandId) brainMap[row.airtableBrandId] = row.id;
				}
				setBrainByAirtable(brainMap);
			}
			const fromUrl =
				typeof window !== 'undefined'
					? new URLSearchParams(window.location.search).get('brand_profile_id') ||
						new URLSearchParams(window.location.search).get('brand') ||
						new URLSearchParams(window.location.search).get('airtableBrandId')
					: null;
			const stored = readWorkingBrandId();
			const resolveRowId = (candidate: string | null | undefined): string | null => {
				if (!candidate) return null;
				if (rows.some((r) => r.id === candidate)) return candidate;
				const airtableForBrain = Object.entries(brainMap).find(([, brain]) => brain === candidate)?.[0];
				if (airtableForBrain && rows.some((r) => r.id === airtableForBrain)) return airtableForBrain;
				return null;
			};
			const pick =
				resolveRowId(fromUrl) ||
				resolveRowId(stored) ||
				rows[0]?.id ||
				'';
			setBrandId(pick);
			if (pick) writeWorkingBrandId(pick);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load().catch(() => setLoading(false));
	}, [load]);

	if (loading) return variant === 'sidebar' ? <p className="text-sm text-text-dim">Workspace loading…</p> : null;
	if (brands.length === 0) return variant === 'sidebar' ? <p className="text-sm text-text-dim">No workspace</p> : null;
	if (brands.length === 1) {
		return (
			<div className={variant === 'sidebar' ? 'truncate text-sm font-medium text-text' : 'hidden md:flex items-center max-w-[180px] truncate text-xs text-text-soft px-2'} title={brands[0].name}>
				{brands[0].name}
			</div>
		);
	}

	return (
		<label className={variant === 'sidebar' ? 'flex w-full flex-col gap-1 text-sm text-text' : 'hidden md:flex items-center gap-2 text-xs text-text-soft mr-2'}>
			<span className={variant === 'sidebar' ? 'sr-only' : 'sr-only'}>Working brand</span>
			<select
				value={brandId}
				onChange={(event) => {
					const next = event.target.value;
					setBrandId(next);
					writeWorkingBrandId(next);
					router.push(hrefWithWorkingBrand(pathname, next, brainByAirtable));
				}}
				className={variant === 'sidebar' ? 'w-full truncate rounded-lg border border-edge bg-bg px-2 py-2 text-sm text-text' : 'max-w-[200px] truncate rounded-lg border border-edge bg-bg px-2 py-1.5 text-xs text-text'}
			>
				{brands.map((brand) => (
					<option key={brand.id} value={brand.id}>
						{brand.name}
					</option>
				))}
			</select>
		</label>
	);
}
