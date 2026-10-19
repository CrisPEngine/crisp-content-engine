'use client';

export type ContentBrandOption = {
	id: string;
	client_name: string;
	airtableBrandId?: string | null;
};

type Props = {
	brands: ContentBrandOption[];
	value: string;
	onChange: (brandId: string) => void;
	className?: string;
};

export function ContentBrandFilter({ brands, value, onChange, className }: Props) {
	if (brands.length === 0) return null;

	return (
		<div className={className}>
			<label className="block text-sm font-medium text-text mb-2">Filter by Brand</label>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full max-w-sm px-4 py-3 rounded-xl2 border-2 border-white/40 bg-surface/50 text-text font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
			>
				<option value="all">All Brands</option>
				{brands.map((brand) => (
					<option key={brand.id} value={brand.id}>
						{brand.client_name}
					</option>
				))}
			</select>
		</div>
	);
}

export async function fetchIntelligenceBrandOptions(): Promise<ContentBrandOption[]> {
	const res = await fetch('/api/intelligence/brands', { cache: 'no-store', credentials: 'include' });
	if (!res.ok) return [];
	const data = await res.json();
	return (Array.isArray(data.brands) ? data.brands : []).map(
		(b: { id: string; name: string; airtableBrandId?: string | null }) => ({
			id: b.id,
			client_name: b.name || 'Unknown Brand',
			airtableBrandId: b.airtableBrandId ?? null,
		}),
	);
}

export function resolveContentBrandBrainId(brands: ContentBrandOption[], storedOrUrlId: string): string | null {
	const trimmed = storedOrUrlId.trim();
	if (!trimmed) return null;
	const direct = brands.find((b) => b.id === trimmed);
	if (direct) return direct.id;
	const byAirtable = brands.find((b) => b.airtableBrandId === trimmed);
	return byAirtable?.id ?? null;
}

export function workingBrandStorageId(brand: ContentBrandOption): string {
	return brand.airtableBrandId?.trim() || brand.id;
}
