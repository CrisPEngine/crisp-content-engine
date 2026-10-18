'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hrefWithWorkingBrand, readWorkingBrandId, writeWorkingBrandId } from '@/lib/brands/workingBrand';

type BrandRow = { id: string; name: string };

export function HeaderBrandSwitcher() {
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
			const data = (await brandRes.json()) as { profiles?: Array<{ id: string; client_name?: string }> };
			if (!brandRes.ok) return;
			const rows: BrandRow[] = (data.profiles ?? []).map((row) => ({
				id: row.id,
				name: row.client_name || 'Unnamed brand',
			}));
			setBrands(rows);
			if (socialRes.ok) {
				const social = (await socialRes.json()) as {
					brands?: Array<{ id: string; airtableBrandId?: string }>;
				};
				const map: Record<string, string> = {};
				for (const row of social.brands ?? []) {
					if (row.airtableBrandId) map[row.airtableBrandId] = row.id;
				}
				setBrainByAirtable(map);
			}
			const fromUrl =
				typeof window !== 'undefined'
					? new URLSearchParams(window.location.search).get('brand_profile_id') ||
						new URLSearchParams(window.location.search).get('brand')
					: null;
			const stored = readWorkingBrandId();
			const pick = (fromUrl && rows.some((r) => r.id === fromUrl) ? fromUrl : null) || (stored && rows.some((r) => r.id === stored) ? stored : rows[0]?.id) || '';
			setBrandId(pick);
			if (pick) writeWorkingBrandId(pick);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load().catch(() => setLoading(false));
	}, [load]);

	if (loading || brands.length === 0) return null;
	if (brands.length === 1) {
		return (
			<div className="hidden md:flex items-center max-w-[180px] truncate text-xs text-white/50 px-2" title={brands[0].name}>
				{brands[0].name}
			</div>
		);
	}

	return (
		<label className="hidden md:flex items-center gap-2 text-xs text-white/50 mr-2">
			<span className="sr-only">Working brand</span>
			<select
				value={brandId}
				onChange={(event) => {
					const next = event.target.value;
					setBrandId(next);
					writeWorkingBrandId(next);
					router.push(hrefWithWorkingBrand(pathname, next, brainByAirtable));
				}}
				className="max-w-[200px] truncate rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white/80"
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
