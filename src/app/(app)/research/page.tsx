'use client';

import { useEffect, useState } from 'react';

type Brand = { id: string; name?: string };
type ResearchRow = {
	id: string;
	request: string;
	projectType: string | null;
	gaps: string[];
	sources: Array<{ url?: string; title?: string }>;
	proposals: Array<{ id: string; text: string; knowledgeClass: string; requiresConfirmation: boolean }>;
	contradictions: Array<{ topic: string; evidenceA: string; evidenceB: string }>;
	trend: { state: string; reason: string } | null;
	reviewSummary: string | null;
};

export default function ResearchPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [brandId, setBrandId] = useState('');
	const [website, setWebsite] = useState('');
	const [query, setQuery] = useState('');
	const [rows, setRows] = useState<ResearchRow[]>([]);
	const [message, setMessage] = useState('');

	useEffect(() => {
		void fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then((body) => {
				const list = Array.isArray(body.brands) ? body.brands : Array.isArray(body) ? body : [];
				setBrands(list);
				if (list[0]?.id) setBrandId(list[0].id);
			})
			.catch(() => setMessage('Sign in to research a brand.'));
	}, []);

	useEffect(() => {
		if (!brandId) return;
		void fetch(`/api/research?brandId=${encodeURIComponent(brandId)}`)
			.then((response) => response.json())
			.then((body) => setRows(Array.isArray(body.research) ? body.research : []))
			.catch(() => setRows([]));
	}, [brandId]);

	async function run(projectType: string) {
		setMessage('');
		const response = await fetch('/api/research', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ brandId, website, query, projectType }),
		});
		const body = await response.json();
		if (!response.ok) {
			setMessage(body.error ?? 'Research failed.');
			return;
		}
		setMessage('Research stored. Findings stay proposals until you confirm them.');
		const list = await fetch(`/api/research?brandId=${encodeURIComponent(brandId)}`).then((item) => item.json());
		setRows(Array.isArray(list.research) ? list.research : []);
	}

	async function confirm(researchId: string, proposalId: string) {
		const response = await fetch('/api/research', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ brandId, researchId, confirmProposalIds: [proposalId] }),
		});
		const body = await response.json();
		setMessage(body.note ?? (body.promotedToBrandBrain ? 'Confirmed and added to Brand Brain.' : 'Confirmation stored.'));
	}

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Research</h1>
				<p className="text-text-soft">Research informs content. It does not silently become Brand Brain truth.</p>
			</div>
			<div className="card p-4 space-y-3">
				<select className="input" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
					{brands.map((brand) => (
						<option key={brand.id} value={brand.id}>{brand.name || brand.id}</option>
					))}
				</select>
				<input className="input" placeholder="Website, for brand discovery" value={website} onChange={(event) => setWebsite(event.target.value)} />
				<input className="input" placeholder="Topic, competitor, or question" value={query} onChange={(event) => setQuery(event.target.value)} />
				<div className="flex flex-wrap gap-2">
					<button className="btn" type="button" onClick={() => run('BRAND_DISCOVERY')}>Research my brand</button>
					<button className="btn" type="button" onClick={() => run('CURRENT_RESEARCH')}>Research topic</button>
					<button className="btn" type="button" onClick={() => run('COMPETITOR_RESEARCH')}>Competitors</button>
					<button className="btn" type="button" onClick={() => run('REVIEW_RESEARCH')}>Reviews</button>
					<button className="btn" type="button" onClick={() => run('TREND_RESEARCH')}>Trends</button>
				</div>
				{message ? <p className="text-sm">{message}</p> : null}
			</div>
			{rows.map((row) => (
				<article className="card p-4 space-y-2" key={row.id}>
					<h2 className="font-medium">{row.projectType || 'Research'} · {row.request}</h2>
					{row.reviewSummary ? <p className="text-sm">{row.reviewSummary}</p> : null}
					{row.trend ? <p className="text-sm">{row.trend.state}: {row.trend.reason}</p> : null}
					{row.gaps.map((gap) => <p className="text-sm" key={gap}>Missing: {gap}</p>)}
					{row.contradictions.map((item) => <p className="text-sm" key={item.evidenceB}>{item.topic}: {item.evidenceA} / {item.evidenceB}</p>)}
					<ul className="text-sm">
						{row.sources.slice(0, 6).map((source) => (
							<li key={source.url}><a href={source.url}>{source.title || source.url}</a></li>
						))}
					</ul>
					{row.proposals.map((proposal) => (
						<button className="btn" key={proposal.id} type="button" onClick={() => confirm(row.id, proposal.id)}>
							Confirm: {proposal.text.slice(0, 140)}
						</button>
					))}
				</article>
			))}
		</div>
	);
}
