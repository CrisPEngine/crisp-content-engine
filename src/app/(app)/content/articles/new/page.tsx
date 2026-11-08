'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Brand = { id: string; name?: string };
type Destination = { id: string; name: string; connected: boolean; taxonomy: { contentTypes: string[] } | null };

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
		targetWords: 3000,
		researchRequirements: '',
		internalLinking: '',
		imageRequirements: 'Hero image and social image',
		externalId: '',
	});

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
		void fetch('/api/websites')
			.then((response) => response.json())
			.then((body) => setDestinations(Array.isArray(body.destinations) ? body.destinations : []))
			.catch(() => setDestinations([]));
	}, []);

	const contentTypes = destinations.find((item) => item.id === form.destinationId)?.taxonomy?.contentTypes ?? ['guide', 'pillar', 'comparison', 'checklist', 'essay'];

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
			body: JSON.stringify(form),
		});
		const body = await response.json();
		setPending(false);
		if (!response.ok) {
			setMessage(body.error ?? 'The article could not be created.');
			return;
		}
		router.push(`/content/articles/${body.article.id}`);
	}

	return (
		<div className="mx-auto max-w-3xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">New article</h1>
				<p className="text-text-soft">The brief uses the selected brand’s Brand Brain. You do not need to build an API request.</p>
			</div>
			<form className="card p-4 space-y-3" onSubmit={createArticle}>
				<label className="block text-sm">Brand
					<select className="input w-full" value={form.brandId} onChange={(event) => set('brandId', event.target.value)}>
						{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name || brand.id}</option>)}
					</select>
				</label>
				<label className="block text-sm">Website destination
					<select className="input w-full" value={form.destinationId} onChange={(event) => set('destinationId', event.target.value)}>
						<option value="">Choose later</option>
						{destinations.map((destination) => (
							<option key={destination.id} value={destination.id}>{destination.name}{destination.connected ? '' : ' (not connected)'}</option>
						))}
					</select>
				</label>
				<label className="block text-sm">Topic
					<input className="input w-full" value={form.topic} onChange={(event) => set('topic', event.target.value)} required />
				</label>
				<label className="block text-sm">Working title
					<input className="input w-full" value={form.workingTitle} onChange={(event) => set('workingTitle', event.target.value)} />
				</label>
				<label className="block text-sm">Primary keyword
					<input className="input w-full" value={form.primaryKeyword} onChange={(event) => set('primaryKeyword', event.target.value)} />
				</label>
				<label className="block text-sm">Search intent
					<input className="input w-full" value={form.searchIntent} onChange={(event) => set('searchIntent', event.target.value)} />
				</label>
				<label className="block text-sm">Target audience
					<input className="input w-full" value={form.audience} onChange={(event) => set('audience', event.target.value)} />
				</label>
				<label className="block text-sm">Content type
					<select className="input w-full" value={form.contentType} onChange={(event) => set('contentType', event.target.value)}>
						{contentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
					</select>
				</label>
				<label className="block text-sm">Target word count
					<input className="input w-full" type="number" min={800} step={100} value={form.targetWords} onChange={(event) => set('targetWords', Number(event.target.value))} />
				</label>
				<label className="block text-sm">Research requirements
					<textarea className="input w-full" rows={3} value={form.researchRequirements} onChange={(event) => set('researchRequirements', event.target.value)} />
				</label>
				<label className="block text-sm">Internal linking preferences
					<textarea className="input w-full" rows={2} value={form.internalLinking} onChange={(event) => set('internalLinking', event.target.value)} />
				</label>
				<label className="block text-sm">Image requirements
					<input className="input w-full" value={form.imageRequirements} onChange={(event) => set('imageRequirements', event.target.value)} />
				</label>
				<label className="block text-sm">External ID
					<input className="input w-full" value={form.externalId} onChange={(event) => set('externalId', event.target.value)} placeholder="cce_pillar_novel-first-draft" />
				</label>
				<button className="btn" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create article'}</button>
				{message ? <p className="text-sm">{message}</p> : null}
			</form>
		</div>
	);
}
