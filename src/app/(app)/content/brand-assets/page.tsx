'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Brand = { id: string; name: string };
type Collection = { id: string; name: string; parentId?: string };
type AssetVision = {
	summary?: string;
	searchTags?: string[];
	suggestedTopics?: string[];
	suggestedChannels?: string[];
	detectedText?: string[];
	brandEntities?: string[];
	altText?: string;
};

type Asset = {
	id: string;
	title?: string;
	url?: string;
	libraryType?: string;
	description?: string;
	altText?: string;
	tags?: string[];
	productFeature?: string;
	verifiedReference?: boolean;
	approvalStatus: string;
	visionAnalysis?: AssetVision;
	visionAnalysisStatus?: string;
	collectionId?: string;
	sourceAttribution?: string;
	rightsNotes?: string;
	aspectRatio?: string;
	width?: number;
	height?: number;
	assetType?: string;
	staleScreenshot?: boolean;
};

const TYPES = ['PRODUCT_PHOTO', 'PRODUCT_SCREENSHOT', 'PRODUCT_UI', 'LOGO', 'BRAND_MARK', 'BRAND_REFERENCE', 'FOUNDER_PHOTO', 'MARKETING_EXAMPLE', 'ARTICLE_IMAGE', 'SOCIAL_IMAGE', 'OTHER'];

export default function BrandAssetsPage() {
	const searchParams = useSearchParams();
	const [brands, setBrands] = useState<Brand[]>([]);
	const [collections, setCollections] = useState<Collection[]>([]);
	const [assets, setAssets] = useState<Asset[]>([]);
	const [brandId, setBrandId] = useState('');
	const [libraryType, setLibraryType] = useState('PRODUCT_PHOTO');
	const [collectionId, setCollectionId] = useState('');
	const [search, setSearch] = useState('');
	const [filterType, setFilterType] = useState('');
	const [filterApproval, setFilterApproval] = useState('');
	const [description, setDescription] = useState('');
	const [productFeature, setProductFeature] = useState('');
	const [sourceAttribution, setSourceAttribution] = useState('');
	const [rightsNotes, setRightsNotes] = useState('');
	const [verified, setVerified] = useState(false);
	const [reference, setReference] = useState(false);
	const [approveOnUpload, setApproveOnUpload] = useState(true);
	const [previews, setPreviews] = useState<Array<{ file: File; url: string; kind: 'image' | 'video' }>>([]);
	const [uploadRows, setUploadRows] = useState<Array<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error'; detail?: string }>>([]);
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [altText, setAltText] = useState('');
	const [tags, setTags] = useState('');
	const [metadataEdited, setMetadataEdited] = useState(false);
	const [analysingId, setAnalysingId] = useState<string | null>(null);
	const [newCollectionName, setNewCollectionName] = useState('');

	const queryString = useMemo(() => {
		const params = new URLSearchParams();
		if (brandId) params.set('brandId', brandId);
		if (search.trim()) params.set('q', search.trim());
		if (filterType) params.set('libraryType', filterType);
		if (filterApproval) params.set('approvalStatus', filterApproval);
		if (collectionId) params.set('collectionId', collectionId);
		return params.toString();
	}, [brandId, search, filterType, filterApproval, collectionId]);

	const load = useCallback(async (nextBrandId = brandId) => {
		const response = await fetch(`/api/brand-assets?${queryString || (nextBrandId ? `brandId=${encodeURIComponent(nextBrandId)}` : '')}`);
		if (response.status === 401) {
			setMessage('Sign in to manage brand assets.');
			return;
		}
		const body = (await response.json()) as { brands?: Brand[]; assets?: Asset[]; collections?: Collection[]; error?: string };
		setBrands(body.brands ?? []);
		setAssets(body.assets ?? []);
		setCollections(body.collections ?? []);
		if (!nextBrandId && body.brands?.[0]) setBrandId(body.brands[0].id);
	}, [brandId, queryString]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void (async () => {
				const response = await fetch('/api/brand-assets');
				if (response.status === 401) {
					setMessage('Sign in to manage brand assets.');
					return;
				}
				const body = (await response.json()) as { brands?: Brand[]; assets?: Asset[]; collections?: Collection[] };
				setBrands(body.brands ?? []);
				setAssets(body.assets ?? []);
				setCollections(body.collections ?? []);
				const requested = searchParams.get('brandId');
				if (requested && body.brands?.some((brand) => brand.id === requested)) {
					setBrandId(requested);
				} else if (body.brands?.[0]) setBrandId(body.brands[0].id);
			})();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [searchParams]);

	useEffect(() => {
		if (!brandId) return;
		void load(brandId);
	}, [brandId, queryString, load]);

	function chooseFiles(files: FileList | null) {
		setPreviews(
			[...(files ?? [])].map((file) => ({
				file,
				url: URL.createObjectURL(file),
				kind: file.type.startsWith('video/') ? 'video' : 'image',
			})),
		);
	}

	async function createCollection() {
		if (!brandId || !newCollectionName.trim()) return;
		await fetch('/api/brand-assets/collections', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ brandId, name: newCollectionName.trim() }),
		});
		setNewCollectionName('');
		await load(brandId);
	}

	async function save() {
		setMessage(null);
		if (!brandId) {
			setMessage('Choose a brand first.');
			return;
		}
		if (previews.length === 0) {
			setMessage('Choose one or more files to upload.');
			return;
		}
		setSaving(true);
		setUploadRows(previews.map((preview) => ({ name: preview.file.name, status: 'pending' as const })));
		let failures = 0;
		for (let index = 0; index < previews.length; index += 1) {
			const preview = previews[index];
			setUploadRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, status: 'uploading' } : row)));
			const form = new FormData();
			form.set('file', preview.file);
			const endpoint = preview.kind === 'video' ? '/api/uploads/video' : '/api/uploads/image';
			const uploaded = await fetch(endpoint, { method: 'POST', body: form });
			const uploadBody = (await uploaded.json()) as { assetId?: string; error?: string };
			if (!uploaded.ok || !uploadBody.assetId) {
				failures += 1;
				setUploadRows((rows) =>
					rows.map((row, rowIndex) =>
						rowIndex === index ? { ...row, status: 'error', detail: uploadBody.error ?? 'Upload failed.' } : row,
					),
				);
				continue;
			}
			const saved = await fetch('/api/brand-assets', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					assetId: uploadBody.assetId,
					brandId,
					libraryType,
					collectionId: collectionId || undefined,
					title: preview.file.name,
					description,
					altText,
					tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
					productFeature,
					sourceAttribution,
					rightsNotes,
					verifiedReference: verified,
					referenceAllowed: reference,
					approvalStatus: approveOnUpload ? 'approved' : 'draft',
					userEdited: metadataEdited,
				}),
			});
			if (!saved.ok) {
				const errorBody = (await saved.json()) as { error?: string };
				failures += 1;
				setUploadRows((rows) =>
					rows.map((row, rowIndex) =>
						rowIndex === index ? { ...row, status: 'error', detail: errorBody.error ?? 'Could not save metadata.' } : row,
					),
				);
				continue;
			}
			setUploadRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, status: 'done' } : row)));
		}
		setSaving(false);
		if (failures === 0) {
			setPreviews([]);
			setMessage(`Saved ${previews.length} asset${previews.length === 1 ? '' : 's'}. Vision enrichment runs in the background.`);
		} else {
			setMessage(`${failures} file${failures === 1 ? '' : 's'} failed. Successful uploads were saved.`);
		}
		await load(brandId);
	}

	async function patchAsset(asset: Asset, patch: Partial<Asset>) {
		await fetch('/api/brand-assets', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ assetId: asset.id, brandId, ...patch }),
		});
		await load(brandId);
	}

	async function deleteAsset(assetId: string) {
		if (!window.confirm('Delete this asset from the brand library? Links on old posts stay broken until you attach a replacement.')) return;
		await fetch(`/api/brand-assets?assetId=${encodeURIComponent(assetId)}&brandId=${encodeURIComponent(brandId)}`, { method: 'DELETE' });
		await load(brandId);
	}

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Brand asset library</h1>
				<p className="text-text-soft mt-2">
					Upload real product photos, app screenshots, and short clips per brand. CCE enriches each file with vision metadata and picks approved assets when posts are generated.
				</p>
			</div>

			<div className="card p-4 grid gap-4 md:grid-cols-2">
				<label className="block text-sm md:col-span-2">
					Brand
					<select className="mt-1 w-full rounded border px-3 py-2" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
						{brands.map((brand) => (
							<option key={brand.id} value={brand.id}>{brand.name}</option>
						))}
					</select>
				</label>
				<label className="block text-sm">
					Collection / folder
					<select className="mt-1 w-full rounded border px-3 py-2" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
						<option value="">No collection</option>
						{collections.map((collection) => (
							<option key={collection.id} value={collection.id}>{collection.name}</option>
						))}
					</select>
				</label>
				<div className="flex gap-2 items-end">
					<label className="block text-sm flex-1">
						New collection
						<input className="mt-1 w-full rounded border px-3 py-2" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="Die-cast arrivals" />
					</label>
					<button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void createCollection()}>Add</button>
				</div>
				<label className="block text-sm">
					Classification
					<select className="mt-1 w-full rounded border px-3 py-2" value={libraryType} onChange={(event) => setLibraryType(event.target.value)}>
						{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
					</select>
				</label>
				<label className="block text-sm">
					Source / credit
					<input className="mt-1 w-full rounded border px-3 py-2" value={sourceAttribution} onChange={(event) => setSourceAttribution(event.target.value)} placeholder="Studio shoot, seller upload" />
				</label>
				<label className="block text-sm md:col-span-2">
					Usage rights notes
					<input className="mt-1 w-full rounded border px-3 py-2" value={rightsNotes} onChange={(event) => setRightsNotes(event.target.value)} placeholder="Licensed for social only" />
				</label>
				<label className="block text-sm md:col-span-2">
					Description (applied to batch)
					<input className="mt-1 w-full rounded border px-3 py-2" value={description} onChange={(event) => { setDescription(event.target.value); setMetadataEdited(true); }} />
				</label>
				<label className="block text-sm">
					Alt text
					<input className="mt-1 w-full rounded border px-3 py-2" value={altText} onChange={(event) => { setAltText(event.target.value); setMetadataEdited(true); }} />
				</label>
				<label className="block text-sm">
					Tags (comma separated)
					<input className="mt-1 w-full rounded border px-3 py-2" value={tags} onChange={(event) => { setTags(event.target.value); setMetadataEdited(true); }} placeholder="ferrari, 1:18, red" />
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={approveOnUpload} onChange={(event) => setApproveOnUpload(event.target.checked)} />
					Mark uploads as approved for auto-selection
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
					Verified brand reference (generative reference)
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={reference} onChange={(event) => setReference(event.target.checked)} disabled={!verified} />
					Allow generative media to use as reference
				</label>
				<label className="block text-sm md:col-span-2">
					Files (images or short video)
					<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,.heic,.heif" multiple className="mt-1 block w-full" onChange={(event) => chooseFiles(event.target.files)} />
				</label>
				<div className="md:col-span-2 flex gap-3 flex-wrap">
					{previews.map((preview) =>
						preview.kind === 'video' ? (
							<video key={preview.url} src={preview.url} className="h-28 w-auto rounded border" controls muted />
						) : (
							<img key={preview.url} src={preview.url} alt="" className="h-28 w-auto rounded border" />
						),
					)}
				</div>
				<div className="md:col-span-2">
					<button className="rounded bg-primary px-4 py-2 text-white disabled:opacity-60" type="button" disabled={saving} onClick={() => void save()}>
						{saving ? 'Uploading…' : 'Upload to library'}
					</button>
					{message ? <p className="text-sm mt-2">{message}</p> : null}
				</div>
			</div>

			<div className="card p-4 flex flex-wrap gap-3 items-end">
				<label className="text-sm flex-1 min-w-[12rem]">
					Search
					<input className="mt-1 w-full rounded border px-3 py-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ferrari, canon view, red" />
				</label>
				<label className="text-sm">
					Type
					<select className="mt-1 rounded border px-3 py-2" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
						<option value="">All</option>
						{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
					</select>
				</label>
				<label className="text-sm">
					Approval
					<select className="mt-1 rounded border px-3 py-2" value={filterApproval} onChange={(event) => setFilterApproval(event.target.value)}>
						<option value="">All</option>
						<option value="approved">Approved</option>
						<option value="draft">Draft</option>
						<option value="rejected">Rejected</option>
					</select>
				</label>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{assets.map((asset) => (
					<div key={asset.id} className="card p-3 space-y-2">
						{asset.url ? (
							asset.assetType === 'video' ? (
								<video src={asset.url} className="mb-2 h-40 w-full object-contain bg-black/20" controls muted />
							) : (
								<img src={asset.url} alt={(asset.altText || asset.title) ?? ''} className="mb-2 h-40 w-full object-contain bg-black/20" />
							)
						) : null}
						<div className="font-medium truncate">{asset.title || asset.libraryType || 'Asset'}</div>
						<p className="text-xs text-text-soft">
							{asset.libraryType} · {asset.approvalStatus}
							{asset.aspectRatio ? ` · ${asset.aspectRatio}` : ''}
							{asset.visionAnalysisStatus ? ` · vision ${asset.visionAnalysisStatus}` : ''}
							{asset.staleScreenshot ? ' · possibly stale screenshot' : ''}
						</p>
						{asset.description ? <p className="text-sm line-clamp-3">{asset.description}</p> : null}
						{asset.visionAnalysis?.summary ? <p className="text-sm text-text-dim line-clamp-2">AI: {asset.visionAnalysis.summary}</p> : null}
						{(asset.tags?.length ?? 0) > 0 ? <p className="text-xs text-text-dim">Tags: {asset.tags?.join(', ')}</p> : null}
						<div className="flex flex-wrap gap-2 text-sm">
							<button type="button" className="underline" onClick={() => void patchAsset(asset, { approvalStatus: asset.approvalStatus === 'approved' ? 'draft' : 'approved' })}>
								{asset.approvalStatus === 'approved' ? 'Unapprove' : 'Approve'}
							</button>
							<button
								type="button"
								className="underline disabled:opacity-50"
								disabled={analysingId === asset.id}
								onClick={() => {
									setAnalysingId(asset.id);
									void fetch('/api/brand-assets/analyse', {
										method: 'POST',
										headers: { 'content-type': 'application/json' },
										body: JSON.stringify({ assetId: asset.id }),
									})
										.then(() => load(brandId))
										.finally(() => setAnalysingId(null));
								}}
							>
								{analysingId === asset.id ? 'Analysing…' : 'Re-analyse'}
							</button>
							<button type="button" className="underline text-danger" onClick={() => void deleteAsset(asset.id)}>Delete</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
