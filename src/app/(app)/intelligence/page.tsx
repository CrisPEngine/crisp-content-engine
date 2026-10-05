'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Brain, Map, Layers, Activity } from 'lucide-react';

type BrandProfile = { id: string; name: string };
type Tab = 'brain' | 'strategy' | 'themes' | 'diagnostics';
type DiagnosticRole = {
	role: string;
	provider: string;
	preferredModel: string;
	fallbacks: string[];
};
type DiagnosticInvocation = {
	role: string;
	provider: string;
	model: string;
	fallback_used: boolean;
	error_code: string | null;
	duration_ms: number | null;
	ok: boolean;
	created_at: string;
};
type IntelligencePayload = {
	brain?: { identity?: unknown; voice?: unknown; guardrails?: unknown };
	strategy?: {
		objectives?: unknown;
		keyMessages?: unknown;
		contentPillars?: unknown;
		positioning?: unknown;
		audiences?: unknown;
	};
	themes?: Array<{ id: string; title: string; objective?: string }>;
};

export default function IntelligencePage() {
	return (
		<Suspense
			fallback={
				<div className="mx-auto max-w-5xl p-6">
					<div className="card p-8 text-center">
						<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
						<p className="text-text-soft">Loading brand intelligence…</p>
					</div>
				</div>
			}
		>
			<IntelligencePageInner />
		</Suspense>
	);
}

function IntelligencePageInner() {
	const searchParams = useSearchParams();
	const [tab, setTab] = useState<Tab>('brain');
	const [brands, setBrands] = useState<BrandProfile[]>([]);
	const [brandId, setBrandId] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [payload, setPayload] = useState<IntelligencePayload | null>(null);
	const [identity, setIdentity] = useState('{\n  "name": "",\n  "positioning": "",\n  "purpose": ""\n}');
	const [voice, setVoice] = useState('{\n  "tone": "",\n  "formality": ""\n}');
	const [guardrails, setGuardrails] = useState('{\n  "phrasesToAvoid": [],\n  "promotionalIntensity": "low"\n}');
	const [strategyJson, setStrategyJson] = useState('{\n  "objectives": [],\n  "keyMessages": [],\n  "contentPillars": []\n}');
	const [diagnostics, setDiagnostics] = useState<{ roles: DiagnosticRole[]; recentInvocations: DiagnosticInvocation[] } | null>(null);

	useEffect(() => {
		if (tab !== 'diagnostics') return;
		let cancelled = false;
		fetch('/api/intelligence/diagnostics', { cache: 'no-store' })
			.then(async (res) => {
				const data = (await res.json()) as {
					roles?: DiagnosticRole[];
					recentInvocations?: DiagnosticInvocation[];
					error?: string;
				};
				if (!res.ok) throw new Error(data.error || 'Diagnostics unavailable');
				if (!cancelled) {
					setDiagnostics({
						roles: data.roles ?? [],
						recentInvocations: data.recentInvocations ?? [],
					});
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Diagnostics unavailable');
			});
		return () => {
			cancelled = true;
		};
	}, [tab]);
	const [themeTitle, setThemeTitle] = useState('');
	const [themeObjective, setThemeObjective] = useState('');
	const [coreIdea, setCoreIdea] = useState('');

	const loadBrands = useCallback(async () => {
		const res = await fetch('/api/brands', { cache: 'no-store' });
		if (!res.ok) throw new Error('Failed to load brands');
		const data = (await res.json()) as { profiles?: Array<{ id: string; client_name?: string; brand_name?: string }> };
		const profiles: BrandProfile[] = (data.profiles || []).map((row: { id: string; client_name?: string; brand_name?: string }) => ({
			id: row.id,
			name: row.client_name || row.brand_name || 'Unnamed Brand',
		}));
		setBrands(profiles);
		const queryBrand = searchParams.get('brand_profile_id');
		setBrandId(queryBrand && profiles.some((row) => row.id === queryBrand) ? queryBrand : profiles[0]?.id || '');
	}, [searchParams]);

	const loadIntelligence = useCallback(async (id: string) => {
		if (!id) return;
		const res = await fetch(`/api/intelligence/brain?airtableBrandId=${encodeURIComponent(id)}`, { cache: 'no-store' });
		const data = (await res.json()) as IntelligencePayload & { error?: string };
		if (!res.ok) throw new Error(data.error || 'Failed to load intelligence');
		setPayload(data);
		if (data.brain) {
			setIdentity(JSON.stringify(data.brain.identity ?? {}, null, 2));
			setVoice(JSON.stringify(data.brain.voice ?? {}, null, 2));
			setGuardrails(JSON.stringify(data.brain.guardrails ?? {}, null, 2));
		}
		if (data.strategy) {
			setStrategyJson(
				JSON.stringify(
					{
						objectives: data.strategy.objectives,
						keyMessages: data.strategy.keyMessages,
						contentPillars: data.strategy.contentPillars,
						positioning: data.strategy.positioning,
						audiences: data.strategy.audiences,
					},
					null,
					2,
				),
			);
		}
	}, []);

	useEffect(() => {
		loadBrands()
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	}, [loadBrands]);

	useEffect(() => {
		if (!brandId) return;
		loadIntelligence(brandId).catch((err) => setError(err.message));
	}, [brandId, loadIntelligence]);

	async function saveBrain() {
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/brain', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					airtableBrandId: brandId,
					identity: JSON.parse(identity),
					voice: JSON.parse(voice),
					guardrails: JSON.parse(guardrails),
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Save failed');
			setNotice('Brand Brain saved. Existing Airtable strategy was not modified.');
			await loadIntelligence(brandId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Save failed');
		} finally {
			setSaving(false);
		}
	}

	async function saveStrategy() {
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const parsed = JSON.parse(strategyJson);
			const res = await fetch('/api/intelligence/strategy', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ airtableBrandId: brandId, ...parsed }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Save failed');
			setNotice('Native strategy saved alongside Airtable. Make strategy flows are unchanged.');
			await loadIntelligence(brandId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Save failed');
		} finally {
			setSaving(false);
		}
	}

	async function createTheme() {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch('/api/intelligence/actions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create_theme',
					input: { airtableBrandId: brandId, title: themeTitle, objective: themeObjective, channels: ['linkedin', 'x', 'blog'] },
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Theme create failed');
			if (coreIdea && data.result?.id) {
				const planRes = await fetch('/api/intelligence/actions', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'generate_theme_plan',
						input: { themeId: data.result.id, coreIdea },
					}),
				});
				const plan = await planRes.json();
				if (!planRes.ok) throw new Error(plan.error || 'Theme plan failed');
			}
			setThemeTitle('');
			setThemeObjective('');
			await loadIntelligence(brandId);
			setNotice('Theme saved. Multi-channel plan generated if a core idea was provided.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Theme failed');
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-5xl p-6">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading brand intelligence…</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<div>
				<h1 className="text-3xl font-semibold">Brand Intelligence</h1>
				<p className="text-sm text-text-dim mt-2">
					Native Brand Brain, strategy, and themes. A saved brand can use native intelligence immediately. Set nativeIntelligenceEnabled to false in guardrails to turn it off for this brand only. Airtable and Make stay available.
				</p>
			</div>

			{brands.length > 1 && (
				<select
					value={brandId}
					onChange={(event) => setBrandId(event.target.value)}
					className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm"
				>
					{brands.map((brand) => (
						<option key={brand.id} value={brand.id}>
							{brand.name}
						</option>
					))}
				</select>
			)}

			{error && <div className="card p-4 border-danger/40 bg-danger/10 text-danger text-sm">{error}</div>}
			{notice && <div className="card p-4 border-primary/40 bg-primary/10 text-sm">{notice}</div>}

			<div className="flex gap-2 border-b border-edge/60">
				{(
					[
						['brain', 'Brand Brain', Brain],
						['strategy', 'Strategy', Map],
						['themes', 'Themes', Layers],
						['diagnostics', 'Diagnostics', Activity],
					] as const
				).map(([id, label, Icon]) => (
					<button
						key={id}
						onClick={() => setTab(id)}
						className={`px-4 py-3 text-sm font-medium border-b-2 ${
							tab === id ? 'border-primary text-primary' : 'border-transparent text-text-dim'
						}`}
					>
						<span className="inline-flex items-center gap-2">
							<Icon className="w-4 h-4" />
							{label}
						</span>
					</button>
				))}
			</div>

			{tab === 'brain' && (
				<div className="space-y-4">
					<label className="block text-sm text-text-soft">Identity JSON</label>
					<textarea className="w-full min-h-40 rounded-xl2 border border-edge/60 bg-surface/30 p-3 font-mono text-xs" value={identity} onChange={(e) => setIdentity(e.target.value)} />
					<label className="block text-sm text-text-soft">Voice JSON</label>
					<textarea className="w-full min-h-32 rounded-xl2 border border-edge/60 bg-surface/30 p-3 font-mono text-xs" value={voice} onChange={(e) => setVoice(e.target.value)} />
					<label className="block text-sm text-text-soft">Guardrails JSON</label>
					<textarea className="w-full min-h-32 rounded-xl2 border border-edge/60 bg-surface/30 p-3 font-mono text-xs" value={guardrails} onChange={(e) => setGuardrails(e.target.value)} />
					<button onClick={saveBrain} disabled={saving || !brandId} className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm">
						{saving ? 'Saving…' : 'Save Brand Brain'}
					</button>
				</div>
			)}

			{tab === 'strategy' && (
				<div className="space-y-4">
					<textarea className="w-full min-h-64 rounded-xl2 border border-edge/60 bg-surface/30 p-3 font-mono text-xs" value={strategyJson} onChange={(e) => setStrategyJson(e.target.value)} />
					<button onClick={saveStrategy} disabled={saving || !brandId} className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm">
						{saving ? 'Saving…' : 'Save native strategy'}
					</button>
				</div>
			)}

			{tab === 'themes' && (
				<div className="space-y-4">
					<div className="grid gap-3">
						<input className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Theme title" value={themeTitle} onChange={(e) => setThemeTitle(e.target.value)} />
						<input className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Objective" value={themeObjective} onChange={(e) => setThemeObjective(e.target.value)} />
						<input className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Core idea for a multi-channel plan" value={coreIdea} onChange={(e) => setCoreIdea(e.target.value)} />
						<button onClick={createTheme} disabled={saving || !themeTitle} className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm">
							Create theme
						</button>
					</div>
					<div className="space-y-2">
						{(payload?.themes || []).map((theme) => (
							<div key={theme.id} className="card p-4">
								<div className="font-medium">{theme.title}</div>
								<div className="text-sm text-text-dim">{theme.objective}</div>
							</div>
						))}
					</div>
				</div>
			)}

			{tab === 'diagnostics' && (
				<div className="space-y-4">
					<div className="card p-4 overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-text-dim">
									<th className="py-2 pr-4">Role</th>
									<th className="py-2 pr-4">Provider</th>
									<th className="py-2 pr-4">Preferred model</th>
									<th className="py-2">Fallbacks</th>
								</tr>
							</thead>
							<tbody>
								{(diagnostics?.roles || []).map((role) => (
									<tr key={role.role} className="border-t border-edge/40">
										<td className="py-2 pr-4">{role.role}</td>
										<td className="py-2 pr-4">{role.provider}</td>
										<td className="py-2 pr-4 font-mono text-xs">{role.preferredModel}</td>
										<td className="py-2 font-mono text-xs">{role.fallbacks.join(', ') || '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="card p-4 overflow-x-auto">
						<div className="text-sm font-medium mb-2">Latest invocations</div>
						{(diagnostics?.recentInvocations || []).length === 0 ? (
							<p className="text-sm text-text-dim">No AI usage logs yet.</p>
						) : (
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-text-dim">
										<th className="py-2 pr-4">When</th>
										<th className="py-2 pr-4">Role</th>
										<th className="py-2 pr-4">Model</th>
										<th className="py-2 pr-4">Fallback</th>
										<th className="py-2 pr-4">Latency</th>
										<th className="py-2">Result</th>
									</tr>
								</thead>
								<tbody>
									{diagnostics?.recentInvocations.map((row) => (
										<tr key={`${row.created_at}-${row.role}-${row.model}`} className="border-t border-edge/40">
											<td className="py-2 pr-4">{new Date(row.created_at).toLocaleString()}</td>
											<td className="py-2 pr-4">{row.role}</td>
											<td className="py-2 pr-4 font-mono text-xs">{row.model}</td>
											<td className="py-2 pr-4">{row.fallback_used ? row.error_code || 'yes' : 'no'}</td>
											<td className="py-2 pr-4">{row.duration_ms ?? '—'} ms</td>
											<td className="py-2">{row.ok ? 'success' : row.error_code || 'failed'}</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
