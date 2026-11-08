'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRIEF_FIELDS, ChoiceWithOther, contentTypeOptions, DEFAULT_CONTENT_TYPES, SEARCH_INTENT_OPTIONS } from '@/components/articles/options';

type Brand = { id: string; name?: string };
type Destination = { key: string; name: string; enabled: boolean; taxonomy: { contentTypes: string[] } | null };

export default function NewArticlePage() {
	const router = useRouter();
	const [brands, setBrands] = useState<Brand[]>([]);
	const [destinations, setDestinations] = useState<Destination[]>([]);
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState(false);
	const [form, setForm] = useState({
		brandId: '',
		destinationId: '',
		topic: '',
		workingTitle: '',
		primaryKeyword: '',
		searchIntent: 'informational',
		audience: '',
		contentType: 'guide',
		targetWords: 2000,
		researchRequirements: '',
		internalLinking: '',
		imageRequirements: 'Hero image and social image',
		externalId: '',
	});
	const [brief, setBrief] = useState<Record<string, string>>({});

	useEffect(() => {
		void fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then((body) => {
				if (body.error) {
					setMessage('Sign in to create an article.');
					return;
				}
				const list = Array.isArray(body.brands) ? body.brands : [];
				setBrands(list);
				if (list[0]?.id) setForm((current) => ({ ...current, brandId: list[0].id }));
			})
			.catch(() => setMessage('Sign in to create an article.'));
	}, []);

	useEffect(() => {
		if (!form.brandId) return;
		void fetch(`/api/websites?brandId=${encodeURIComponent(form.brandId)}`)
			.then((response) => response.json())
			.then((body) => setDestinations(Array.isArray(body.destinations) ? body.destinations : []))
			.catch(() => setDestinations([]));
	}, [form.brandId]);

	const destinationTypes = destinations.find((item) => item.key === form.destinationId)?.taxonomy?.contentTypes;
	const contentTypes = contentTypeOptions(destinationTypes?.length ? destinationTypes : DEFAULT_CONTENT_TYPES);

	function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	async function createArticle(event: React.FormEvent) {
		event.preventDefault();
		setPending(true);
		setMessage('');
		const response = await fetch('/api/articles', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...form, brief }),
		});
		const body = await response.json();
		setPending(false);
		if (!response.ok) {
			setMessage(body.error ?? 'The article could not be created.');
			return;
		}
		router.push(`/content/articles/${body.article.id}${body.existing ? '?existing=1' : ''}`);
	}

	return (
		<div className="mx-auto max-w-3xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">New article</h1>
				<p className="text-text-soft">The brief uses the selected brand’s Brand Brain. If an article with the same external ID or title exists, it opens instead of creating a duplicate.</p>
			</div>
			<form className="card p-4 space-y-3" onSubmit={createArticle}>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">Brand
						<select className="input w-full" value={form.brandId} onChange={(event) => set('brandId', event.target.value)}>
							{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name || brand.id}</option>)}
						</select>
					</label>
					<label className="block text-sm">Website destination
						<select className="input w-full" value={form.destinationId} onChange={(event) => set('destinationId', event.target.value)}>
							<option value="">Choose later</option>
							{destinations.map((destination) => (
								<option key={destination.key} value={destination.key} disabled={!destination.enabled}>{destination.name}{destination.enabled ? '' : ' (disabled)'}</option>
							))}
						</select>
					</label>
				</div>
				<label className="block text-sm">Topic
					<input className="input w-full" value={form.topic} onChange={(event) => set('topic', event.target.value)} required />
				</label>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">Working title
						<input className="input w-full" value={form.workingTitle} onChange={(event) => set('workingTitle', event.target.value)} />
					</label>
					<label className="block text-sm">Primary keyword
						<input className="input w-full" value={form.primaryKeyword} onChange={(event) => set('primaryKeyword', event.target.value)} />
					</label>
					<ChoiceWithOther label="Search intent" value={form.searchIntent} options={SEARCH_INTENT_OPTIONS} onChange={(value) => set('searchIntent', value)} />
					<ChoiceWithOther key={form.destinationId} label="Content type" value={form.contentType} options={contentTypes} onChange={(value) => set('contentType', value)} />
					<label className="block text-sm">Target audience
						<input className="input w-full" value={form.audience} onChange={(event) => set('audience', event.target.value)} />
					</label>
					<label className="block text-sm">Target word count
						<input className="input w-full" type="number" min={300} max={12000} step={100} value={form.targetWords} onChange={(event) => set('targetWords', Number(event.target.value))} />
					</label>
				</div>
				<details className="text-sm">
					<summary>Optional details</summary>
					<div className="grid gap-3 md:grid-cols-2 pt-2">
						{BRIEF_FIELDS.map((field) => (
							<label key={field.key} className="block text-sm">
								{field.label} <span className="text-xs text-text-soft">{field.hint}</span>
								{field.rows > 1 ? (
									<textarea className="input w-full" rows={field.rows} value={brief[field.key] ?? ''} onChange={(event) => setBrief({ ...brief, [field.key]: event.target.value })} />
								) : (
									<input className="input w-full" value={brief[field.key] ?? ''} onChange={(event) => setBrief({ ...brief, [field.key]: event.target.value })} />
								)}
							</label>
						))}
						<label className="block text-sm">Research requirements
							<textarea className="input w-full" rows={2} value={form.researchRequirements} onChange={(event) => set('researchRequirements', event.target.value)} />
						</label>
						<label className="block text-sm">Internal linking preferences
							<textarea className="input w-full" rows={2} value={form.internalLinking} onChange={(event) => set('internalLinking', event.target.value)} />
						</label>
						<label className="block text-sm">Image requirements <span className="text-xs text-text-soft">Write “none” if no images are needed.</span>
							<input className="input w-full" value={form.imageRequirements} onChange={(event) => set('imageRequirements', event.target.value)} />
						</label>
						<label className="block text-sm">External ID <span className="text-xs text-text-soft">Links to an existing CMS entry so it is updated, not duplicated.</span>
							<input className="input w-full" value={form.externalId} onChange={(event) => set('externalId', event.target.value)} placeholder="cce_pillar_novel-first-draft" />
						</label>
					</div>
				</details>
				<button className="btn" type="submit" disabled={pending || !form.searchIntent.trim() || !form.contentType.trim()}>{pending ? 'Creating…' : 'Create article'}</button>
				{message ? <p className="text-sm" role="alert">{message}</p> : null}
			</form>
		</div>
	);
}
