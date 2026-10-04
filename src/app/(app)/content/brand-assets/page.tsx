'use client';

import { useEffect, useState } from 'react';

type Brand = { id: string; name: string };
type Asset = { id: string; title?: string; url?: string; libraryType?: string; description?: string; productFeature?: string; verifiedReference?: boolean; approvalStatus: string };

const TYPES = ['PRODUCT_SCREENSHOT', 'PRODUCT_UI', 'LOGO', 'BRAND_MARK', 'BRAND_REFERENCE', 'PRODUCT_PHOTO', 'FOUNDER_PHOTO', 'MARKETING_EXAMPLE', 'ARTICLE_IMAGE', 'SOCIAL_IMAGE', 'OTHER'];

export default function BrandAssetsPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [assets, setAssets] = useState<Asset[]>([]);
	const [brandId, setBrandId] = useState('');
	const [libraryType, setLibraryType] = useState('PRODUCT_SCREENSHOT');
	const [description, setDescription] = useState('');
	const [productFeature, setProductFeature] = useState('');
	const [verified, setVerified] = useState(true);
	const [reference, setReference] = useState(true);
	const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
	const [message, setMessage] = useState<string | null>(null);

	async function load(nextBrandId = brandId) {
		const response = await fetch(`/api/brand-assets${nextBrandId ? `?brandId=${encodeURIComponent(nextBrandId)}` : ''}`);
		if (response.status === 401) {
			setMessage('Sign in to manage brand assets.');
			return;
		}
		const body = (await response.json()) as { brands?: Brand[]; assets?: Asset[]; error?: string };
		setBrands(body.brands ?? []);
		setAssets(body.assets ?? []);
		if (!nextBrandId && body.brands?.[0]) setBrandId(body.brands[0].id);
	}

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void (async () => {
				const response = await fetch('/api/brand-assets');
				if (response.status === 401) {
					setMessage('Sign in to manage brand assets.');
					return;
				}
				const body = (await response.json()) as { brands?: Brand[]; assets?: Asset[] };
				setBrands(body.brands ?? []);
				setAssets(body.assets ?? []);
				if (body.brands?.[0]) setBrandId(body.brands[0].id);
			})();
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	function chooseFiles(files: FileList | null) {
		setPreviews([...(files ?? [])].map((file) => ({ file, url: URL.createObjectURL(file) })));
	}

	async function save() {
		setMessage(null);
		if (!brandId) {
			setMessage('Choose a brand first.');
			return;
		}
		for (const preview of previews) {
			const form = new FormData();
			form.set('file', preview.file);
			const uploaded = await fetch('/api/uploads/image', { method: 'POST', body: form });
			const uploadBody = (await uploaded.json()) as { assetId?: string; error?: string };
			if (!uploaded.ok || !uploadBody.assetId) {
				setMessage(uploadBody.error ?? 'Upload failed.');
				return;
			}
			const saved = await fetch('/api/brand-assets', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					assetId: uploadBody.assetId,
					brandId,
					libraryType,
					title: preview.file.name,
					description,
					productFeature,
					verifiedReference: verified,
					referenceAllowed: reference,
				}),
			});
			if (!saved.ok) {
				const errorBody = (await saved.json()) as { error?: string };
				setMessage(errorBody.error ?? 'Could not save asset metadata.');
				return;
			}
		}
		setPreviews([]);
		setMessage('Saved.');
		await load(brandId);
	}

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Brand assets</h1>
				<p className="text-text-soft mt-2">Upload product screenshots and other reference images. CCE stores them in Cloudinary and can use verified references when planning media.</p>
			</div>
			<div className="card p-4 space-y-3">
				<label className="block text-sm">
					Brand
					<select className="mt-1 w-full rounded border px-3 py-2" value={brandId} onChange={(event) => { setBrandId(event.target.value); void load(event.target.value); }}>
						{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
					</select>
				</label>
				<label className="block text-sm">
					Classification
					<select className="mt-1 w-full rounded border px-3 py-2" value={libraryType} onChange={(event) => setLibraryType(event.target.value)}>
						{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
					</select>
				</label>
				<label className="block text-sm">
					Description
					<input className="mt-1 w-full rounded border px-3 py-2" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this image shows" />
				</label>
				<label className="block text-sm">
					Product feature
					<input className="mt-1 w-full rounded border px-3 py-2" value={productFeature} onChange={(event) => setProductFeature(event.target.value)} placeholder="Canon view, proposed fact, approved fact" />
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
					Verified brand reference
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={reference} onChange={(event) => setReference(event.target.checked)} />
					Generative media may use this as a reference
				</label>
				<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => chooseFiles(event.target.files)} />
				<div className="flex gap-3 flex-wrap">
					{previews.map((preview) => <img key={preview.url} src={preview.url} alt="" className="h-28 w-auto rounded border" />)}
				</div>
				<button className="rounded bg-primary px-4 py-2 text-white" type="button" onClick={() => void save()}>Save assets</button>
				{message ? <p className="text-sm">{message}</p> : null}
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				{assets.map((asset) => (
					<div key={asset.id} className="card p-3">
						{asset.url ? <img src={asset.url} alt={asset.title ?? ''} className="mb-2 h-40 w-full object-contain bg-black/20" /> : null}
						<div className="font-medium">{asset.title || asset.libraryType || 'Image'}</div>
						<p className="text-sm text-text-soft">{asset.libraryType} · {asset.productFeature || 'no feature tag'} · {asset.verifiedReference ? 'verified' : asset.approvalStatus}</p>
						{asset.description ? <p className="text-sm mt-1">{asset.description}</p> : null}
					</div>
				))}
			</div>
		</div>
	);
}
