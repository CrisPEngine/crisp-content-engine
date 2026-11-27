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

function shortRequest(request: string): string {
	const sentence = request.split(/(?<=\.)\s/)[0] ?? request;
	return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

function safeDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return 'Unknown domain';
	}
}

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
				<article className="card space-y-4 p-4" key={row.id}>
					<header>
						<p className="text-xs font-medium uppercase tracking-wide text-text-dim">{row.projectType || 'Research'} · {row.sources.length} source{row.sources.length === 1 ? '' : 's'}</p>
						<h2 className="text-lg font-semibold">{shortRequest(row.request)}</h2>
						<details>
							<summary className="cursor-pointer text-sm text-link">Full stored request</summary>
							<p className="mt-2 text-sm">{row.request}</p>
						</details>
						<p className="text-sm text-text-soft">Findings stay proposals until someone confirms them. A source title is a stored search result, not a verified Brand Brain fact. Dates that were not stored are marked unknown.</p>
					</header>
					{row.reviewSummary ? <section><h3 className="font-medium">Summary</h3><p className="text-sm">{row.reviewSummary}</p></section> : null}
					{row.trend ? <section><h3 className="font-medium">Trend</h3><p className="text-sm">{row.trend.state}: {row.trend.reason}</p></section> : null}
					{row.gaps.length ? <section><h3 className="font-medium">Limits</h3>{row.gaps.map((gap) => <p className="text-sm" key={gap}>{gap}</p>)}</section> : null}
					{row.sources.length ? (
						<section className="space-y-2">
							<h3 className="font-medium">Sources</h3>
							{row.sources.slice(0, 8).map((source) => {
								const domain = source.url ? safeDomain(source.url) : 'Unknown domain';
								return (
									<div key={source.url || source.title} className="rounded-xl border border-edge p-3 text-sm">
										<p className="font-medium">{source.title || 'Untitled source'}</p>
										<p className="text-text-soft">{domain} · Retrieved date unknown · Not a verified brand fact</p>
										{source.url ? <a className="text-link" href={source.url}>{source.url}</a> : null}
									</div>
								);
							})}
						</section>
					) : null}
					{row.contradictions.length ? (
						<section>
							<h3 className="font-medium">Contradictions in the stored research</h3>
							{row.contradictions.map((item) => <p className="text-sm" key={`${item.topic}-${item.evidenceB}`}>{item.topic}: {item.evidenceA} / {item.evidenceB}</p>)}
						</section>
					) : null}
					{row.proposals.length ? (
						<section className="space-y-2">
							<h3 className="font-medium">Unverified proposals</h3>
							{row.proposals.map((proposal) => (
								<button className="btn w-full justify-start text-left" key={proposal.id} type="button" onClick={() => confirm(row.id, proposal.id)}>
									Confirm for Brand Brain: {proposal.text.slice(0, 180)}
								</button>
							))}
						</section>
					) : null}
				</article>
			))}
		</div>
	);
}
