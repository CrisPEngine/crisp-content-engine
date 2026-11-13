'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Brain, Map, Layers, Activity, Lightbulb, LayoutDashboard } from 'lucide-react';
import { resolveWorkingBrandId, writeWorkingBrandId } from '@/lib/brands/workingBrand';
import type { StrategyCompletenessResult } from '@/lib/intelligence/strategy/strategyCompleteness';
import { HumanBrandBrain } from '@/components/HumanBrandBrain';
import { CapabilityCatalogue } from '@/components/intelligence/CapabilityCatalogue';
import { IntelligenceHome } from '@/components/intelligence/IntelligenceHome';
import { CardSkeleton } from '@/components/skeletons/Skeleton';
import { CRISP_CANONICAL_AIRTABLE_ID, CRISP_RECONCILIATION_REASON, CRISP_RETAINED_PRODUCT_PROFILE_ID } from '@/lib/intelligence/crisp/nativeBrand';

type BrandProfile = { id: string; name: string };
type Tab = 'overview' | 'brain' | 'strategy' | 'themes' | 'learnings' | 'diagnostics';
type BrainArea = 'identity' | 'products' | 'capabilities' | 'audiences' | 'voice' | 'guardrails' | 'claims';
type LearningRow = { id: string; scope?: string; channel?: string; observation: string; confidence?: string };
type EditLearningRow = { id: string; signalType: string; observation: string; confidence: string; status: string; occurrenceCount: number };
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
	brand_id?: string | null;
	feature?: string | null;
	estimated_cost_usd?: number | null;
};
type StrategyGenerationMeta = {
	phase?: string;
	modelRole?: string;
	model?: string;
	error?: string;
	jobId?: string;
};

type LegacyStrategyPreview = {
	status?: string;
	content?: string;
	native?: { phase?: string; completeness?: StrategyCompletenessResult };
};

type IntelligencePayload = {
	brain?: { identity?: unknown; voice?: unknown; guardrails?: unknown; knowledge?: unknown };
	completeness?: StrategyCompletenessResult | null;
	nativePhase?: string;
	strategy?: {
		objectives?: unknown;
		keyMessages?: unknown;
		contentPillars?: unknown;
		positioning?: unknown;
		audiences?: unknown;
		draftPayload?: Record<string, unknown> | null;
		generationMetadata?: StrategyGenerationMeta;
		status?: string;
	};
	themes?: Array<{ id: string; title: string; objective?: string; description?: string; status?: string; channels?: string[]; targetAudience?: string }>;
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
	const router = useRouter();
	const [tab, setTab] = useState<Tab>('overview');
	const [area, setArea] = useState<BrainArea>('identity');
	const [recordId, setRecordId] = useState('');
	const [knowledgeFilter, setKnowledgeFilter] = useState('all');
	const [themeQuery, setThemeQuery] = useState('');
	const [learningFilter, setLearningFilter] = useState('all');
	const [savedBrain, setSavedBrain] = useState('');
	const [brands, setBrands] = useState<BrandProfile[]>([]);
	const [brandId, setBrandId] = useState<string>('');
	const brainAirtableId = brandId === CRISP_RETAINED_PRODUCT_PROFILE_ID ? CRISP_CANONICAL_AIRTABLE_ID : brandId;
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [payload, setPayload] = useState<IntelligencePayload | null>(null);
	const [identity, setIdentity] = useState('{\n  "name": "",\n  "positioning": "",\n  "purpose": ""\n}');
	const [voice, setVoice] = useState('{\n  "tone": "",\n  "formality": ""\n}');
	const [guardrails, setGuardrails] = useState('{\n  "phrasesToAvoid": [],\n  "promotionalIntensity": "low"\n}');
	const [knowledge, setKnowledge] = useState('{\n  "brandFacts": [],\n  "proofPoints": []\n}');
	const [strategyJson, setStrategyJson] = useState('{\n  "objectives": [],\n  "keyMessages": [],\n  "contentPillars": []\n}');
	const [diagnostics, setDiagnostics] = useState<{ roles: DiagnosticRole[]; recentInvocations: DiagnosticInvocation[] } | null>(null);
	const [strategyGenerating, setStrategyGenerating] = useState(false);
	const [strategyInstructions, setStrategyInstructions] = useState('');
	const [strategyResearchId, setStrategyResearchId] = useState('');
	const [strategyEscalate, setStrategyEscalate] = useState(false);
	const [draftPreview, setDraftPreview] = useState('');
	const [legacyStrategy, setLegacyStrategy] = useState<LegacyStrategyPreview | null>(null);
	const [completeness, setCompleteness] = useState<StrategyCompletenessResult | null>(null);
	const [learningsPayload, setLearningsPayload] = useState<{
		content: LearningRow[];
		edits: EditLearningRow[];
		editorial: LearningRow[];
	} | null>(null);

	useEffect(() => {
		const requested = searchParams.get('section') || searchParams.get('tab');
		if (requested === 'overview' || requested === 'brain' || requested === 'strategy' || requested === 'themes' || requested === 'learnings' || requested === 'diagnostics') setTab(requested);
		const nextArea = searchParams.get('area');
		if (nextArea === 'identity' || nextArea === 'products' || nextArea === 'capabilities' || nextArea === 'audiences' || nextArea === 'voice' || nextArea === 'guardrails' || nextArea === 'claims') setArea(nextArea);
		setRecordId(searchParams.get('record') || '');
		setKnowledgeFilter(searchParams.get('filter') || 'all');
		setLearningFilter(searchParams.get('learning') || 'all');
	}, [searchParams]);

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
			name: row.id === CRISP_RETAINED_PRODUCT_PROFILE_ID
				? 'CrisP Digital'
				: row.id === CRISP_CANONICAL_AIRTABLE_ID
					? 'CrisP Digital consultancy'
					: row.client_name || row.brand_name || 'Unnamed Brand',
		}));
		setBrands(profiles);
		const ids = profiles.map((row) => row.id);
		const resolved = resolveWorkingBrandId(searchParams, ids, profiles[0]?.id);
		setBrandId(resolved);
		if (resolved) writeWorkingBrandId(resolved);
	}, [searchParams]);

	const loadIntelligence = useCallback(async (id: string) => {
		if (!id) return;
		const res = await fetch(`/api/intelligence/brain?airtableBrandId=${encodeURIComponent(id)}`, { cache: 'no-store' });
		const data = (await res.json()) as IntelligencePayload & { error?: string };
		if (!res.ok) throw new Error(data.error || 'Failed to load intelligence');
		setPayload(data);
		setCompleteness(data.completeness ?? null);
		if (data.brain) {
			const nextIdentity = JSON.stringify(data.brain.identity ?? {}, null, 2);
			const nextVoice = JSON.stringify(data.brain.voice ?? {}, null, 2);
			const nextGuardrails = JSON.stringify(data.brain.guardrails ?? {}, null, 2);
			const nextKnowledge = JSON.stringify(data.brain.knowledge ?? {}, null, 2);
			setIdentity(nextIdentity);
			setVoice(nextVoice);
			setGuardrails(nextGuardrails);
			setKnowledge(nextKnowledge);
			setSavedBrain(`${nextIdentity}\n${nextVoice}\n${nextGuardrails}\n${nextKnowledge}`);
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
			setDraftPreview(
				data.strategy.draftPayload ? JSON.stringify(data.strategy.draftPayload, null, 2) : '',
			);
		}
	}, []);

	const loadLegacyStrategy = useCallback(async (id: string) => {
		const res = await fetch(`/api/strategy/${encodeURIComponent(id)}`, { cache: 'no-store' });
		if (!res.ok) {
			setLegacyStrategy(null);
			return;
		}
		const data = (await res.json()) as LegacyStrategyPreview;
		setLegacyStrategy(data);
	}, []);

	useEffect(() => {
		loadBrands()
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	}, [loadBrands]);

	useEffect(() => {
		if (!brandId) return;
		loadIntelligence(brainAirtableId).catch((err) => setError(err.message));
	}, [brandId, loadIntelligence]);

	useEffect(() => {
		if (!brandId || tab !== 'strategy') return;
		void loadLegacyStrategy(brandId);
	}, [brandId, tab, loadLegacyStrategy]);

	useEffect(() => {
		if (!brandId || tab !== 'learnings') return;
		let cancelled = false;
		fetch(`/api/intelligence/learnings?airtableBrandId=${encodeURIComponent(brainAirtableId)}`, { cache: 'no-store' })
			.then(async (res) => {
				const data = (await res.json()) as {
					content?: LearningRow[];
					edits?: EditLearningRow[];
					editorial?: LearningRow[];
					error?: string;
				};
				if (!res.ok) throw new Error(data.error || 'Failed to load learnings');
				if (!cancelled) {
					setLearningsPayload({
						content: data.content ?? [],
						edits: data.edits ?? [],
						editorial: data.editorial ?? [],
					});
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load learnings');
			});
		return () => {
			cancelled = true;
		};
	}, [brandId, tab]);

	useEffect(() => {
		if (payload?.strategy?.generationMetadata?.phase !== 'generating') return;
		const timer = setInterval(() => {
			loadIntelligence(brainAirtableId).catch(() => undefined);
		}, 4000);
		return () => clearInterval(timer);
	}, [payload?.strategy?.generationMetadata?.phase, brandId, loadIntelligence]);

	const needsNativeStrategy = useMemo(() => {
		if (!completeness) return true;
		return !completeness.complete || completeness.isSkeleton || completeness.phase === 'missing' || completeness.phase === 'failed';
	}, [completeness]);

	function openWorkspace(section: Tab, extra?: { area?: string; filter?: string; record?: string }) {
		setTab(section);
		const areas: BrainArea[] = ['identity', 'products', 'capabilities', 'audiences', 'voice', 'guardrails', 'claims'];
		if (extra?.area && areas.includes(extra.area as BrainArea)) setArea(extra.area as BrainArea);
		if (extra?.filter) setKnowledgeFilter(extra.filter);
		if (extra && 'record' in extra) setRecordId(extra.record || '');
		const params = new URLSearchParams(searchParams.toString());
		params.set('section', section);
		params.delete('tab');
		if (extra?.area) params.set('area', extra.area);
		else if (section !== 'brain') params.delete('area');
		if (extra?.filter) params.set('filter', extra.filter);
		else params.delete('filter');
		if (extra?.record) params.set('record', extra.record);
		else params.delete('record');
		router.push(`/intelligence?${params.toString()}`);
	}

	function onBrandChange(nextBrandId: string) {
		setBrandId(nextBrandId);
		writeWorkingBrandId(nextBrandId);
		const params = new URLSearchParams(searchParams.toString());
		params.set('brand_profile_id', nextBrandId);
		router.replace(`/intelligence?${params.toString()}`, { scroll: false });
	}

	function strategyObject(): Record<string, unknown> {
		try {
			const parsed = JSON.parse(strategyJson);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	function strategyLines(key: string): string {
		const value = strategyObject()[key];
		return Array.isArray(value) ? value.map(String).join('\n') : '';
	}

	function strategyText(key: string): string {
		const value = strategyObject()[key];
		return typeof value === 'string' ? value : '';
	}

	function updateStrategyList(key: string, value: string) {
		setStrategyJson(JSON.stringify({ ...strategyObject(), [key]: value.split('\n').map((line) => line.trim()).filter(Boolean) }, null, 2));
	}

	function updateStrategyField(key: string, value: string) {
		setStrategyJson(JSON.stringify({ ...strategyObject(), [key]: value }, null, 2));
	}

	async function activateBrand() {
		if (!brandId) return;
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/activate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ airtableBrandId: brainAirtableId }),
			});
			const data = (await res.json()) as { error?: string; brandId?: string; alreadyActive?: boolean };
			if (!res.ok) throw new Error(data.error || 'Activation failed');
			setNotice(data.alreadyActive ? 'Brand brain was already active.' : 'Brand brain activated from Airtable profile.');
			await loadIntelligence(brainAirtableId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Activation failed');
		} finally {
			setSaving(false);
		}
	}

	async function saveBrain() {
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/brain', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					airtableBrandId: brainAirtableId,
					identity: JSON.parse(identity),
					voice: JSON.parse(voice),
					guardrails: JSON.parse(guardrails),
					knowledge: JSON.parse(knowledge),
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Save failed');
			setNotice('Brand Brain saved. Existing Airtable strategy was not modified.');
			await loadIntelligence(brainAirtableId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Save failed');
		} finally {
			setSaving(false);
		}
	}

	async function regenerateNativeStrategyDeep() {
		if (!brandId) return;
		setStrategyGenerating(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/strategy/regenerate-native', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					airtableBrandId: brainAirtableId,
					escalate: true,
					runWebsiteResearch: true,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				importedSnapshot?: boolean;
				job?: { status?: string; error?: string; jobId?: string };
			};
			if (!res.ok) throw new Error(data.error || 'Native strategy regeneration failed');
			if (data.job?.status === 'failed') throw new Error(data.job.error || 'Native strategy regeneration failed');
			setNotice(
				data.importedSnapshot
					? 'Regeneration started using your legacy Make strategy as reference input. Watch progress below; nothing is activated until you choose Activate draft.'
					: 'Regeneration started from brand brain and website research. Watch progress below; nothing is activated until you choose Activate draft.',
			);
			await loadIntelligence(brainAirtableId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Native strategy regeneration failed');
		} finally {
			setStrategyGenerating(false);
		}
	}

	async function generateNativeStrategy() {
		if (!brandId) return;
		setStrategyGenerating(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/strategy/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					airtableBrandId: brainAirtableId,
					researchId: strategyResearchId.trim() || undefined,
					instructions: strategyInstructions || undefined,
					escalate: strategyEscalate,
				}),
			});
			const data = (await res.json()) as { error?: string; job?: { status?: string; error?: string; jobId?: string } };
			if (!res.ok) throw new Error(data.error || 'Native strategy generation failed');
			if (data.job?.status === 'failed') throw new Error(data.job.error || 'Native strategy generation failed');
			setNotice(
				'Native strategy draft is ready for review. Your Make/Airtable strategy is unchanged until you activate this draft.',
			);
			await loadIntelligence(brainAirtableId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Native strategy generation failed');
		} finally {
			setStrategyGenerating(false);
		}
	}

	async function activateNativeDraft() {
		if (!brandId) return;
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/strategy/activate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ airtableBrandId: brainAirtableId }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(data.error || 'Activation failed');
			setNotice('Native strategy activated and synced to Airtable for approval. You can open the strategy page to approve.');
			await loadIntelligence(brainAirtableId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Activation failed');
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
				body: JSON.stringify({ airtableBrandId: brainAirtableId, ...parsed }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Save failed');
			setNotice('Native strategy saved alongside Airtable. Make strategy flows are unchanged.');
			await loadIntelligence(brainAirtableId);
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
					input: { airtableBrandId: brainAirtableId, title: themeTitle, objective: themeObjective, channels: ['linkedin', 'x', 'blog'] },
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
			await loadIntelligence(brainAirtableId);
			setNotice('Theme saved. Multi-channel plan generated if a core idea was provided.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Theme failed');
		} finally {
			setSaving(false);
		}
	}

	const brainDirty = Boolean(savedBrain) && savedBrain !== `${identity}\n${voice}\n${guardrails}\n${knowledge}`;
	useEffect(() => {
		if (!brainDirty) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [brainDirty]);

	if (loading) {
		return (
			<div className="mx-auto max-w-6xl p-6 space-y-3" aria-busy="true">
				<p className="text-sm text-text-soft">Loading brand intelligence…</p>
				<CardSkeleton />
				<CardSkeleton />
			</div>
		);
	}

	const brandName = brands.find((brand) => brand.id === brandId)?.name || 'Brand';
	const sectionLabel: Record<Tab, string> = {
		overview: 'Overview',
		brain: 'Brand Brain',
		strategy: 'Strategy',
		themes: 'Themes',
		learnings: 'Learnings',
		diagnostics: 'Diagnostics',
	};
	const areaLabel: Record<BrainArea, string> = {
		identity: 'Identity',
		products: 'Products and services',
		capabilities: 'Capabilities',
		audiences: 'Audiences',
		voice: 'Voice and messaging',
		guardrails: 'Guardrails',
		claims: 'Claims and evidence',
	};

	return (
		<div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
			<header className="sticky top-0 z-20 -mx-4 border-b border-edge/60 bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
				<p className="text-xs text-text-dim">CCE / Intelligence / {brandName} / {sectionLabel[tab]}{tab === 'brain' ? ` / ${areaLabel[area]}` : ''}</p>
				<div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h1 className="text-2xl font-semibold">{brandName}</h1>
					{brands.length > 1 ? (
						<label className="text-sm">
							<span className="sr-only">Brand</span>
							<select value={brandId} onChange={(event) => onBrandChange(event.target.value)} className="w-full rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 sm:w-auto">
								{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
							</select>
						</label>
					) : null}
				</div>
				<nav className="mt-3 flex gap-2 overflow-x-auto" aria-label="Brand Intelligence">
					{(
						[
							['overview', 'Overview', LayoutDashboard],
							['brain', 'Brand Brain', Brain],
							['strategy', 'Strategy', Map],
							['themes', 'Themes', Layers],
							['learnings', 'Learnings', Lightbulb],
							['diagnostics', 'Diagnostics', Activity],
						] as const
					).map(([id, label, Icon]) => (
						<button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => openWorkspace(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${tab === id ? 'border-primary bg-primary/15 font-medium' : 'border-transparent text-text-dim'}`}>
							<Icon className="h-4 w-4" aria-hidden />
							{label}
						</button>
					))}
				</nav>
			</header>

			<div aria-live="polite">
				{error ? <div className="card border-danger/40 bg-danger/10 p-4 text-sm text-danger" role="alert">{error} You can try the action again. Unrelated records were not changed.</div> : null}
				{notice ? <div className="card border-primary/40 bg-primary/10 p-4 text-sm">{notice}</div> : null}
			</div>
			{brandId && !payload?.brain ? (
				<div className="card space-y-2 border-warning/40 bg-warning/10 p-4 text-sm">
					<p>This brand does not have a Brand Brain yet.</p>
					<button type="button" onClick={() => void activateBrand()} disabled={saving} className="rounded-xl2 border border-primary/40 bg-primary/10 px-4 py-2 text-sm">{saving ? 'Activating…' : 'Activate brand'}</button>
				</div>
			) : null}
			{brandId === CRISP_RETAINED_PRODUCT_PROFILE_ID ? <p className="text-sm text-text-dim">{CRISP_RECONCILIATION_REASON} Brand Intelligence uses the consultancy brain. The content queue and LinkedIn connection stay on the product profile.</p> : null}

			{tab === 'overview' && brainAirtableId && payload?.brain ? <IntelligenceHome brandId={brainAirtableId} brandName={brandName} onOpen={(section, extra) => openWorkspace(section, extra)} /> : null}

			{tab === 'brain' && payload?.brain ? (
				<div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
					<nav className="flex gap-2 overflow-x-auto lg:block lg:space-y-1" aria-label="Brand Brain">
						{(Object.keys(areaLabel) as BrainArea[]).map((id) => (
							<button key={id} type="button" aria-current={area === id ? 'page' : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm lg:w-full ${area === id ? 'bg-primary/15 font-medium' : 'hover:bg-surface'}`} onClick={() => openWorkspace('brain', { area: id })}>{areaLabel[id]}</button>
						))}
					</nav>
					<div className="space-y-4">
						{area === 'capabilities' && brainAirtableId ? (
							<CapabilityCatalogue brandId={brainAirtableId} initialFilter={knowledgeFilter} initialRecord={recordId} onRecord={(id) => openWorkspace('brain', { area: 'capabilities', filter: knowledgeFilter, record: id })} />
						) : (
							<>
								<HumanBrandBrain focus={area === 'capabilities' ? 'identity' : area} identityJson={identity} voiceJson={voice} guardrailsJson={guardrails} knowledgeJson={knowledge} onIdentity={setIdentity} onVoice={setVoice} onGuardrails={setGuardrails} onKnowledge={setKnowledge} />
								<div className="flex flex-wrap items-center gap-3">
									<button type="button" onClick={() => void saveBrain()} disabled={saving || !brandId || !brainDirty} className="rounded-xl2 border border-primary/40 bg-primary/10 px-4 py-2 text-sm">{saving ? 'Saving…' : brainDirty ? 'Save changes' : 'Saved'}</button>
									<p className="text-sm text-text-dim">{saving ? 'Saving this section…' : brainDirty ? 'Unsaved changes' : 'All changes saved'}</p>
								</div>
							</>
						)}
					</div>
				</div>
			) : null}

			{tab === 'strategy' && (
				<div className="space-y-4">
					{needsNativeStrategy ? (
						<div className="card p-4 space-y-3 border-warning/40 bg-warning/10">
							<h2 className="font-semibold text-base">Native strategy not ready for this brand</h2>
							<p className="text-sm text-text-soft">
								{completeness?.isSkeleton || completeness?.phase === 'skeleton'
									? 'Your native strategy is still a skeleton (platform placeholders only). Regenerate natively to get full pillars, channel cadences, themes, and guardrails.'
									: completeness?.phase === 'missing'
										? 'No native strategy draft exists yet for this brand.'
										: completeness?.phase === 'failed'
											? `The last native generation failed${payload?.strategy?.generationMetadata?.error ? `: ${payload.strategy.generationMetadata.error}` : '.'}`
											: 'Your native strategy is incomplete. Regenerate to fill gaps before approving or generating content.'}
							</p>
							{completeness?.reasons?.length ? (
								<ul className="text-xs text-text-dim list-disc pl-5 space-y-1">
									{completeness.reasons.slice(0, 4).map((reason) => (
										<li key={reason}>{reason}</li>
									))}
								</ul>
							) : null}
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => void regenerateNativeStrategyDeep()}
									disabled={strategyGenerating || payload?.strategy?.generationMetadata?.phase === 'generating'}
									className="px-4 py-2 rounded-xl2 bg-primary hover:bg-primary/90 text-white text-sm font-medium disabled:opacity-50"
								>
									{strategyGenerating || payload?.strategy?.generationMetadata?.phase === 'generating'
										? 'Regenerating native strategy…'
										: 'Regenerate strategy natively (deep)'}
								</button>
								<Link
									href={`/strategy/${encodeURIComponent(brandId)}`}
									className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-sm"
								>
									Open legacy strategy approval page
								</Link>
							</div>
						</div>
					) : null}

					{(legacyStrategy?.content || draftPreview) && (
						<div className="grid gap-4 md:grid-cols-2">
							{legacyStrategy?.content ? (
								<details className="card p-4 border-edge/60" open={needsNativeStrategy}>
									<summary className="cursor-pointer text-sm font-medium">Legacy Make / Airtable strategy (reference)</summary>
									<pre className="mt-3 text-xs overflow-auto max-h-80 whitespace-pre-wrap text-text-soft">{legacyStrategy.content}</pre>
								</details>
							) : null}
							{draftPreview ? (
								<details className="card p-4 border-primary/30" open>
									<summary className="cursor-pointer text-sm font-medium">Native draft (not active until you activate)</summary>
									<pre className="mt-3 text-xs overflow-auto max-h-80 whitespace-pre-wrap">{draftPreview}</pre>
								</details>
							) : null}
						</div>
					)}

					<div className="card p-4 space-y-3 border-primary/30 bg-primary/5">
						<p className="text-sm text-text-soft">
							Generate or refine a native AI strategy draft here. Legacy Make content stays in Airtable until you activate a native draft.
						</p>
						<input
							className="w-full rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm"
							placeholder="Optional research record ID (from Research after running premiumdiecast.com)"
							value={strategyResearchId}
							onChange={(event) => setStrategyResearchId(event.target.value)}
						/>
						<textarea
							className="w-full min-h-20 rounded-xl2 border border-edge/60 bg-surface/30 p-3 text-sm"
							placeholder="Optional instructions for this run (e.g. emphasize research on premiumdiecast.com)"
							value={strategyInstructions}
							onChange={(event) => setStrategyInstructions(event.target.value)}
						/>
						<label className="flex items-center gap-2 text-sm text-text-soft">
							<input type="checkbox" checked={strategyEscalate} onChange={(e) => setStrategyEscalate(e.target.checked)} />
							Use deep strategy model (slower, richer)
						</label>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => void generateNativeStrategy()}
								disabled={strategyGenerating || !brandId}
								className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm"
							>
								{strategyGenerating ? 'Generating native strategy…' : payload?.strategy?.draftPayload ? 'Regenerate native draft' : 'Generate native strategy'}
							</button>
							{payload?.strategy?.draftPayload ? (
								<>
									<button
										type="button"
										onClick={() => void activateNativeDraft()}
										disabled={saving || payload?.strategy?.generationMetadata?.phase === 'generating'}
										className="px-4 py-2 rounded-xl2 border border-emerald-500/40 bg-emerald-500/10 text-sm"
									>
										{saving ? 'Activating…' : 'Activate draft (sync to Airtable)'}
									</button>
									<Link
										href={`/strategy/${encodeURIComponent(brandId)}`}
										className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-sm inline-flex items-center"
									>
										Approve on strategy page
									</Link>
								</>
							) : null}
						</div>
						{payload?.strategy?.generationMetadata?.phase === 'generating' && (
							<p className="text-sm text-text-soft flex items-center gap-2">
								<Loader2 className="w-4 h-4 animate-spin" /> Generating…
							</p>
						)}
						{payload?.strategy?.generationMetadata?.phase === 'ready' && payload.strategy.generationMetadata.modelRole && (
							<p className="text-xs text-text-dim">
								Draft model role: {payload.strategy.generationMetadata.modelRole}
								{payload.strategy.generationMetadata.model ? ` (${payload.strategy.generationMetadata.model})` : ''}
							</p>
						)}
						{payload?.strategy?.generationMetadata?.phase === 'failed' && payload.strategy.generationMetadata.error && (
							<p className="text-sm text-danger">{payload.strategy.generationMetadata.error}</p>
						)}
					</div>
					{draftPreview ? (
						<details className="card p-4" open>
							<summary className="cursor-pointer text-sm font-medium">Native draft preview (not active until you activate)</summary>
							<pre className="mt-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">{draftPreview}</pre>
						</details>
					) : null}
					<label className="block text-sm text-text-soft">Objectives, one per line</label>
					<textarea
						className="w-full min-h-32 rounded-xl2 border border-edge/60 bg-surface/30 p-3 text-sm"
						value={strategyLines('objectives')}
						onChange={(event) => updateStrategyList('objectives', event.target.value)}
					/>
					<label className="block text-sm text-text-soft">Positioning</label>
					<input className="w-full rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" value={strategyText('positioning')} onChange={(event) => updateStrategyField('positioning', event.target.value)} />
					<label className="block text-sm text-text-soft">Key messages, one per line</label>
					<textarea className="w-full min-h-24 rounded-xl2 border border-edge/60 bg-surface/30 p-3 text-sm" value={strategyLines('keyMessages')} onChange={(event) => updateStrategyList('keyMessages', event.target.value)} />
					<label className="block text-sm text-text-soft">Content pillars, one per line</label>
					<textarea className="w-full min-h-24 rounded-xl2 border border-edge/60 bg-surface/30 p-3 text-sm" value={strategyLines('contentPillars')} onChange={(event) => updateStrategyList('contentPillars', event.target.value)} />
					<details>
						<summary className="cursor-pointer text-sm">Advanced — raw JSON</summary>
						<textarea className="mt-2 w-full min-h-64 rounded-xl2 border border-edge/60 bg-surface/30 p-3 font-mono text-xs" value={strategyJson} onChange={(e) => setStrategyJson(e.target.value)} />
					</details>
					<button onClick={saveStrategy} disabled={saving || !brandId} className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm">
						{saving ? 'Saving…' : 'Save strategy'}
					</button>
				</div>
			)}

			{tab === 'themes' && (
				<div className="space-y-4">
					<input className="w-full rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Search themes" value={themeQuery} onChange={(event) => setThemeQuery(event.target.value)} />
					<div className="grid gap-3">
						<input className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Theme title" value={themeTitle} onChange={(e) => setThemeTitle(e.target.value)} />
						<input className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Objective" value={themeObjective} onChange={(e) => setThemeObjective(e.target.value)} />
						<input className="rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-sm" placeholder="Core idea for a multi-channel plan" value={coreIdea} onChange={(e) => setCoreIdea(e.target.value)} />
						<button onClick={createTheme} disabled={saving || !themeTitle} className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm">
							Create theme
						</button>
					</div>
					<div className="space-y-2">
						{(payload?.themes || []).filter((theme) => `${theme.title} ${theme.objective || ''} ${theme.description || ''}`.toLowerCase().includes(themeQuery.trim().toLowerCase())).map((theme) => (
							<div key={theme.id} className="card p-4 space-y-1">
								<div className="font-medium">{theme.title}</div>
								<div className="text-sm text-text-dim">{theme.description || theme.objective}</div>
								<div className="text-xs text-text-soft">{theme.status || 'active'}{theme.targetAudience ? ` · ${theme.targetAudience}` : ''}{theme.channels?.length ? ` · ${theme.channels.join(', ')}` : ''}</div>
								<button
									type="button"
									className="text-sm underline"
									disabled={saving}
									onClick={() => {
										setSaving(true);
										void fetch('/api/intelligence/actions', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({ action: 'create_theme', input: { airtableBrandId: brainAirtableId, id: theme.id, title: theme.title, objective: theme.objective, description: theme.description, channels: theme.channels, status: theme.status === 'paused' ? 'active' : 'paused' } }),
										}).then(() => loadIntelligence(brainAirtableId)).finally(() => setSaving(false));
									}}
								>
									{saving ? 'Saving…' : theme.status === 'paused' ? 'Resume' : 'Pause'}
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			{tab === 'learnings' && (
				<div className="space-y-4">
					<p className="text-sm text-text-soft">Accepted learnings can influence future writing. Proposed, rejected, and deferred learnings do not.</p>
					<div className="flex gap-2 overflow-x-auto">
						{['all', 'pending', 'accepted', 'rejected', 'deferred'].map((item) => (
							<button key={item} type="button" className={`shrink-0 rounded-full border px-3 py-1 text-sm capitalize ${learningFilter === item ? 'border-primary bg-primary/15' : 'border-edge'}`} onClick={() => setLearningFilter(item)}>{item === 'pending' ? 'Pending' : item}</button>
						))}
					</div>
					{!learningsPayload ? (
						<p className="text-sm text-text-dim">Loading learnings…</p>
					) : (
						<>
							<div className="card p-4 space-y-2">
								<h2 className="font-semibold text-sm">Editorial feedback</h2>
								{learningsPayload.editorial.length === 0 ? (
									<p className="text-sm text-text-dim">No editorial learnings yet.</p>
								) : (
									<ul className="space-y-2 text-sm">
										{learningsPayload.editorial.slice(0, 12).map((row) => (
											<li key={row.id} className="border-b border-edge/40 pb-2">
												{row.channel ? <span className="text-text-dim">{row.channel}: </span> : null}
												{row.observation}
											</li>
										))}
									</ul>
								)}
							</div>
							<div className="card p-4 space-y-2">
								<h2 className="font-semibold text-sm">Edit patterns</h2>
								{learningsPayload.edits.length === 0 ? (
									<p className="text-sm text-text-dim">No edit patterns yet.</p>
								) : (
									<ul className="space-y-2 text-sm">
										{learningsPayload.edits.filter((row) => learningFilter === 'all' || (learningFilter === 'pending' ? row.status === 'proposed' : row.status === learningFilter)).map((row) => (
											<li key={row.id} className="border-b border-edge/40 pb-2">
												<span className="text-text-dim">{row.signalType} ({row.confidence}, {row.status}): </span>
												{row.observation}
											</li>
										))}
									</ul>
								)}
							</div>
						</>
					)}
				</div>
			)}

			{tab === 'diagnostics' && (
				<div className="space-y-4">
					<p className="text-sm text-text-soft">Native intelligence is on for an active brand. A single brand can be turned off from Advanced raw guardrails with nativeIntelligenceEnabled set to false.</p>
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
										<th className="py-2 pr-4">Result</th>
										<th className="py-2 pr-4">Cost</th>
										<th className="py-2">Brand</th>
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
											<td className="py-2 pr-4">{row.ok ? 'Succeeded' : row.error_code || 'Failed'}</td>
											<td className="py-2 pr-4">{row.estimated_cost_usd ?? '—'}</td>
											<td className="py-2 font-mono text-xs">{row.brand_id ? `${row.brand_id.slice(0, 8)}…` : 'Not recorded'}</td>
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
