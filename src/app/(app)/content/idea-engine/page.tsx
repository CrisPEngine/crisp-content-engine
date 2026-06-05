'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { motion, AnimatePresence } from 'framer-motion';
import {
	Lightbulb, Sparkles, RefreshCw, Trash2, Edit3, Check, X as XIcon,
	ChevronLeft, Loader2, Lock, AlertCircle, CheckCircle2, Zap,
} from 'lucide-react';
import type { PlanId } from '@/config/pricing';
import { CAPS } from '@/config/pricing';
import { computeIdeaEngineRequestedCounts } from '@/lib/ideaEngineQuota';
import type { IdeaEngineQuotaRemaining } from '@/lib/ideaEngineQuota';

// ─── Types ──────────────────────────────────────────────────────────────────

type BrandProfile = { id: string; client_name: string; status: string };

type Step = 'input' | 'preview' | 'generating' | 'review' | 'done';

type ChannelKey = 'LinkedIn' | 'X' | 'Blog' | 'Instagram' | 'Facebook';

type SeriesItem = {
	id: string;
	channel: string;
	post_title: string;
	body_draft: string;
	image_prompt: string;
	hashtags: string;
	series_position: number;
	series_total: number;
	status: string;
	// Local UI state
	_editing: boolean;
	_editDraft: { post_title: string; body_draft: string; hashtags: string; image_prompt: string };
	_saving: boolean;
	_regenerating: boolean;
	_deleted: boolean;
};

type QuotaChannel = { limit: number; used: number; remaining: number };
type Quota = Record<string, QuotaChannel>;

// ─── Constants ───────────────────────────────────────────────────────────────

const GOAL_OPTIONS = ['Awareness', 'Engagement', 'Traffic', 'Conversion'] as const;

const CHANNEL_ICONS: Record<string, string> = {
	LinkedIn: '💼', X: '𝕏', Blog: '📝', Instagram: '📷', Facebook: '👥',
};

const PLATFORM_COLORS: Record<string, string> = {
	LinkedIn: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
	X: 'text-text-soft border-edge/60 bg-surface/30',
	Blog: 'text-accent border-accent/30 bg-accent/10',
	Instagram: 'text-pink-400 border-pink-400/30 bg-pink-400/10',
	Facebook: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KNOWN_PLANS: PlanId[] = ['starter', 'creator', 'growth', 'pro', 'scale'];

/**
 * Normalise a raw plan string to a known PlanId.
 * 'free', null, or any unrecognised value → 'starter' (Idea Engine locked).
 * This is the canonical rule; no plan maps to a higher tier than it resolves to.
 */
function normalisePlan(raw: string | null): PlanId {
	if (!raw) return 'starter';
	const p = raw.toLowerCase();
	return (KNOWN_PLANS.includes(p as PlanId) ? p : 'starter') as PlanId;
}

/**
 * Compute stage messaging based on progress percentage and channels.
 * Returns a deterministic, professional message that feels intentional.
 */
function getStageMessage(progressPercent: number, channels: string[]): string {
	if (progressPercent < 15) return 'Understanding your idea';
	if (progressPercent < 40) return 'Expanding strategic angles';
	
	// Channel-specific messages when filling
	if (progressPercent < 85) {
		// Rotate through selected channels in order
		if (channels.includes('LinkedIn')) return 'Writing LinkedIn drafts';
		if (channels.includes('X')) return 'Drafting X posts';
		if (channels.includes('Blog')) return 'Building blog content';
		if (channels.includes('Instagram')) return 'Crafting Instagram captions';
		if (channels.includes('Facebook')) return 'Creating Facebook posts';
		return 'Generating content';
	}
	
	return 'Preparing your review screen';
}

function platformChannels(plan: PlanId): ChannelKey[] {
	const platforms = CAPS[plan]?.includedPlatforms || [];
	const map: Record<string, ChannelKey> = {
		linkedin: 'LinkedIn', x: 'X', blog: 'Blog', instagram: 'Instagram', facebook: 'Facebook',
	};
	return (platforms.map(p => map[p]).filter(Boolean) as ChannelKey[]);
}

// Removed: expectedCounts() — preview now uses computedCounts from quota-aware computation.

// ─── Component ───────────────────────────────────────────────────────────────

export default function IdeaEnginePage() {
	const router = useRouter();
	const supabase = useSupabase();

	// ── Auth + Plan ──────────────────────────────────────────────
	const [userPlan, setUserPlan] = useState<PlanId | null>(null);
	const [planLoading, setPlanLoading] = useState(true);

	// ── Step machine ─────────────────────────────────────────────
	const [step, setStep] = useState<Step>('input');

	// ── Form state ───────────────────────────────────────────────
	const [brands, setBrands] = useState<BrandProfile[]>([]);
	const [selectedBrand, setSelectedBrand] = useState('');
	const [idea, setIdea] = useState('');
	const [goal, setGoal] = useState<string>('');
	const [notes, setNotes] = useState('');
	const [selectedChannels, setSelectedChannels] = useState<ChannelKey[]>([]);

	// ── Quota ────────────────────────────────────────────────────
	const [quota, setQuota] = useState<Quota>({});
	const [quotaLoading, setQuotaLoading] = useState(false);

	// ── Computed series counts (quota-aware, plan-aware) ─────────
	// Derived from quota + plan after loadQuota(). Preview is built from these.
	const [computedCounts, setComputedCounts] = useState<Record<string, number>>({});
	const [droppedChannels, setDroppedChannels] = useState<string[]>([]);

	// ── Generation ───────────────────────────────────────────────
	const [runId, setRunId] = useState<string>('');
	const [runStatus, setRunStatus] = useState<string>('');
	const [totalExpected, setTotalExpected] = useState<number>(0);
	const [totalGenerated, setTotalGenerated] = useState<number>(0);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Track which item IDs were "just added" so we can show a transient badge
	const [newlyReadyIds, setNewlyReadyIds] = useState<Set<string>>(new Set());
	const prevReadyIds = useRef<Set<string>>(new Set());

	// ── Review ───────────────────────────────────────────────────
	const [items, setItems] = useState<SeriesItem[]>([]);

	// ── Submission state ─────────────────────────────────────────
	const [submitting, setSubmitting] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [duplicateWarning, setDuplicateWarning] = useState(false);

	// ── Done state ───────────────────────────────────────────────
	const [queuedCount, setQueuedCount] = useState(0);

	// ── Load plan & brands ───────────────────────────────────────
	useEffect(() => {
		if (!supabase) return;
		Promise.all([loadPlan(), loadBrands()]);
	}, [supabase]);

	async function loadPlan() {
		setPlanLoading(true);
		try {
			const res = await fetch('/api/plan', { cache: 'no-store' });
			if (res.ok) {
				const data = await res.json();
				// Normalise at the point of setting: 'free' and unknown → 'starter' (locked)
				const plan = normalisePlan(data.planName || null);
				setUserPlan(plan);
				if (plan !== 'starter') {
					const chs = platformChannels(plan).filter(ch => ch !== 'Blog');
					if (chs.length > 0) setSelectedChannels(chs);
				}
			}
		} catch {
			setUserPlan('starter');
		} finally {
			setPlanLoading(false);
		}
	}

	async function loadBrands() {
		try {
			const res = await fetch('/api/brands', { cache: 'no-store' });
			if (!res.ok) return;
			const data = await res.json();
			const approved = (data.profiles || []).filter((p: BrandProfile) => {
				const s = (p.status || '').toLowerCase();
				return s.includes('approved') || s === 'strategy approved';
			});
			setBrands(approved);
			if (approved.length === 1) setSelectedBrand(approved[0].id);
		} catch (err) {
			console.error('Failed to load brands:', err);
		}
	}

	// ── Load quota when moving to preview ────────────────────────
	async function loadQuota() {
		setQuotaLoading(true);
		try {
			const res = await fetch('/api/content/quota', { cache: 'no-store' });
			if (res.ok) {
				const data = await res.json();
				const channels = data.channels || {};
				setQuota(channels);

				// Compute plan-aware, quota-aware counts immediately
				const qr: IdeaEngineQuotaRemaining = {
					linkedin:  channels.linkedin?.remaining  ?? 0,
					x:         channels.x?.remaining         ?? 0,
					blog:      channels.blog?.remaining       ?? 0,
					meta_pool: channels.meta_pool?.remaining  ?? 0,
				};
				const { requestedCounts, droppedChannels: dropped } =
					computeIdeaEngineRequestedCounts(selectedChannels, userPlan ?? 'starter', qr);
				setComputedCounts(requestedCounts);
				setDroppedChannels(dropped);
			}
		} catch {
			/* non-fatal */
		} finally {
			setQuotaLoading(false);
		}
	}

	// ── Polling ──────────────────────────────────────────────────
	const startPolling = useCallback((id: string) => {
		if (pollRef.current) clearInterval(pollRef.current);
		pollRef.current = setInterval(async () => {
			try {
				const res = await fetch(`/api/idea-engine/run/${id}`, { cache: 'no-store' });
				if (!res.ok) return;
				const data = await res.json();
				const { run, items: runItems, generated_items_count } = data;

				setRunStatus(run.status);
				setTotalExpected(run.total_expected || 0);
				setTotalGenerated(generated_items_count || run.total_generated || 0);

			// Always update items (placeholders + filled) during generation
			if (runItems && runItems.length > 0) {
				setItems((prev) => {
					const prevMap = new Map(prev.map((it) => [it.id, it]));
					return runItems.map((item: any) => ({
						...item,
						_editing: prevMap.get(item.id)?._editing ?? false,
						_editDraft: prevMap.get(item.id)?._editDraft ?? {
							post_title: item.post_title || '',
							body_draft: item.body_draft || '',
							hashtags: item.hashtags || '',
							image_prompt: item.image_prompt || '',
						},
						_saving: false,
						_regenerating: item.status === 'regenerating',
						_deleted: prevMap.get(item.id)?._deleted ?? false,
					}));
				});

				// Detect newly ready items (transitioned from placeholder → ready this poll)
				const currentReadyIds = new Set<string>(
					runItems
						.filter((it: { body_draft?: string; status?: string; id: string }) =>
							it.body_draft || it.status === 'ready')
						.map((it: { id: string }) => it.id as string)
				);
				const justAdded = new Set<string>();
				currentReadyIds.forEach(id => {
					if (!prevReadyIds.current.has(id)) justAdded.add(id);
				});
				prevReadyIds.current = currentReadyIds;
				if (justAdded.size > 0) {
					setNewlyReadyIds(prev => new Set([...prev, ...justAdded]));
					// Clear "just added" badges after 2.5 seconds
					setTimeout(() => {
						setNewlyReadyIds(prev => {
							const next = new Set(prev);
							justAdded.forEach(id => next.delete(id));
							return next;
						});
					}, 2500);
				}
			}

				const hasRegenerating = runItems?.some(
					(it: { status?: string }) => it.status === 'regenerating',
				);
				if (
					(run.status === 'review' || run.status === 'completed') &&
					!hasRegenerating
				) {
					clearInterval(pollRef.current!);
					setStep('review');
				} else if (run.status === 'failed') {
					clearInterval(pollRef.current!);
					// Keep the user in the generation workspace so they can see partial results
					// (ready items) and clearly understand what failed.
					setError(run.error || 'Generation failed. Please try again.');
					setStep('generating');
				}
			} catch {
				/* keep polling */
			}
		}, 3000);
	}, []);

	useEffect(() => {
		return () => { if (pollRef.current) clearInterval(pollRef.current); };
	}, []);

	// ─── Step: Input ─────────────────────────────────────────────

	function handleChannelToggle(ch: ChannelKey) {
		setSelectedChannels(prev =>
			prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
		);
	}

	async function handleContinueToPreview() {
		setError(null);
		if (!selectedBrand) return setError('Please select a brand.');
		if (idea.trim().length < 10) return setError('Please describe your idea in at least 10 characters.');
		if (selectedChannels.length === 0) return setError('Please select at least one channel.');
		await loadQuota();
		setStep('preview');
	}

	// ─── Step: Preview ────────────────────────────────────────────

	function getQuotaRemainingForChannel(ch: ChannelKey): number {
		const key = ch.toLowerCase();
		if (key === 'instagram' || key === 'facebook') return quota.meta_pool?.remaining ?? 0;
		return quota[key]?.remaining ?? 0;
	}

	// No hard quota block — series shrinks gracefully. Only block if all channels zero.
	function allChannelsZero(): boolean {
		return !quotaLoading && Object.keys(computedCounts).length === 0;
	}

	async function handleGenerate(forceDuplicate = false) {
		setSubmitting(true);
		setError(null);
		setDuplicateWarning(false);

		try {
			const res = await fetch('/api/idea-engine/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brand_profile_id: selectedBrand,
					idea: idea.trim(),
					goal: goal || undefined,
					notes: notes.trim() || undefined,
					selected_channels: selectedChannels,
					publish_mode: 'queue_only',
					force_duplicate: forceDuplicate,
				}),
			});

			const data = await res.json();

			if (res.status === 409 && data.duplicate_detected) {
				setDuplicateWarning(true);
				setSubmitting(false);
				return;
			}

			if (!res.ok) {
				setError(data.error || 'Failed to start generation');
				setSubmitting(false);
				return;
			}

			setRunId(data.run_id);
			setRunStatus('generating');
			const expectedTotal = Object.values(computedCounts).reduce((a, b) => a + b, 0);
			setTotalExpected(expectedTotal > 0 ? expectedTotal : selectedChannels.length);
			setTotalGenerated(0);
			setStep('generating');
			startPolling(data.run_id);

		} catch {
			setError('Network error. Please try again.');
		} finally {
			setSubmitting(false);
		}
	}

	// ─── Step: Review ─────────────────────────────────────────────

	function startEdit(itemId: string) {
		setItems(prev => prev.map(it =>
			it.id === itemId ? { ...it, _editing: true } : it
		));
	}

	function cancelEdit(itemId: string) {
		setItems(prev => prev.map(it =>
			it.id === itemId
				? { ...it, _editing: false, _editDraft: { post_title: it.post_title, body_draft: it.body_draft, hashtags: it.hashtags, image_prompt: it.image_prompt } }
				: it
		));
	}

	function updateDraft(itemId: string, field: keyof SeriesItem['_editDraft'], value: string) {
		setItems(prev => prev.map(it =>
			it.id === itemId ? { ...it, _editDraft: { ...it._editDraft, [field]: value } } : it
		));
	}

	async function saveEdit(itemId: string) {
		const item = items.find(it => it.id === itemId);
		if (!item) return;

		setItems(prev => prev.map(it => it.id === itemId ? { ...it, _saving: true } : it));

		try {
			const res = await fetch(`/api/idea-engine/items/${itemId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(item._editDraft),
			});

			if (res.ok) {
				setItems(prev => prev.map(it =>
					it.id === itemId
						? {
							...it,
							post_title: it._editDraft.post_title,
							body_draft: it._editDraft.body_draft,
							hashtags: it._editDraft.hashtags,
							image_prompt: it._editDraft.image_prompt,
							_editing: false,
							_saving: false,
						}
						: it
				));
			} else {
				setItems(prev => prev.map(it => it.id === itemId ? { ...it, _saving: false } : it));
			}
		} catch {
			setItems(prev => prev.map(it => it.id === itemId ? { ...it, _saving: false } : it));
		}
	}

	async function deleteItem(itemId: string) {
		setItems(prev => prev.map(it => it.id === itemId ? { ...it, _deleted: true } : it));

		try {
			const res = await fetch(`/api/idea-engine/items/${itemId}`, { method: 'DELETE' });
			if (!res.ok) {
				setItems(prev => prev.map(it => it.id === itemId ? { ...it, _deleted: false } : it));
			}
		} catch {
			setItems(prev => prev.map(it => it.id === itemId ? { ...it, _deleted: false } : it));
		}
	}

	async function regenerateItem(itemId: string) {
		setItems(prev => prev.map(it => it.id === itemId ? { ...it, _regenerating: true } : it));

		try {
			const res = await fetch(`/api/idea-engine/items/${itemId}/regenerate`, { method: 'POST' });
			if (!res.ok) {
				setItems(prev => prev.map(it => it.id === itemId ? { ...it, _regenerating: false } : it));
				return;
			}
			// Native engine updates item in DB; poll until status leaves regenerating
			if (runId) startPolling(runId);
		} catch {
			setItems(prev => prev.map(it => it.id === itemId ? { ...it, _regenerating: false } : it));
		}
	}

	async function handleConfirm() {
		setConfirming(true);
		setError(null);

		const activeItems = items.filter(it => !it._deleted);
		if (activeItems.length === 0) {
			setError('No items to add to queue.');
			setConfirming(false);
			return;
		}

		try {
			const res = await fetch('/api/idea-engine/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					run_id: runId,
					item_ids: activeItems.map(it => it.id),
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				setError(data.error || 'Failed to add items to queue');
				setConfirming(false);
				return;
			}

			setQueuedCount(data.queued);
			setStep('done');

		} catch {
			setError('Network error. Please try again.');
		} finally {
			setConfirming(false);
		}
	}

	async function handleCancel() {
		if (runId) {
			await fetch(`/api/idea-engine/run/${runId}`, { method: 'DELETE' }).catch(() => {});
		}
		router.push('/content/generate');
	}

	// ─── Render ───────────────────────────────────────────────────

	if (planLoading) {
		return (
			<div className="mx-auto max-w-3xl flex items-center justify-center py-20">
				<Loader2 className="w-6 h-6 animate-spin text-primary" />
			</div>
		);
	}

	// Starter: locked state
	if (userPlan === 'starter') {
		return (
			<div className="mx-auto max-w-3xl py-8">
				<button onClick={() => router.back()} className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1 mb-6">
					← Back
				</button>
				<div className="card p-10 text-center flex flex-col items-center gap-4">
					<div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
						<Lock className="w-7 h-7 text-primary" />
					</div>
					<h1 className="text-2xl font-semibold">Idea Engine</h1>
					<p className="text-text-dim max-w-md">
						Turn one idea into a week of content — across LinkedIn, X, Blog, and more.
					</p>
					<p className="text-text-soft text-sm max-w-sm">
						Upgrade to Creator to unlock the Idea Engine and start generating coordinated content series.
					</p>
					<a
						href="/billing"
						className="mt-2 px-6 py-3 rounded-xl2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-semibold"
					>
						Upgrade to Creator
					</a>
				</div>
			</div>
		);
	}

	// Use effective plan so channel list is never empty: "free"/unknown → scale (full experience)
	const allowedChannels = platformChannels(userPlan ?? 'starter');
	const activeItems = items.filter(it => !it._deleted);

	return (
		<div className="mx-auto max-w-3xl py-4 md:py-8">
			<button onClick={() => step === 'input' ? router.back() : setStep('input')} className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1 mb-6">
				← {step === 'input' ? 'Back' : 'Start over'}
			</button>

			{/* Header */}
			<div className="mb-6 flex items-center gap-3">
				<div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
					<Lightbulb className="w-5 h-5 text-primary" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold">Idea Engine</h1>
					<p className="text-text-dim text-sm">Turn one idea into a week of content</p>
				</div>
			</div>

			{/* Error banner */}
			{error && (
				<div className="mb-4 flex items-start gap-2 p-3 rounded-xl2 border border-danger/30 bg-danger/10 text-danger text-sm">
					<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
					<span>{error}</span>
					<button onClick={() => setError(null)} className="ml-auto shrink-0 text-danger/60 hover:text-danger">✕</button>
				</div>
			)}

			{/* Duplicate warning */}
			{duplicateWarning && (
				<div className="mb-4 p-4 rounded-xl2 border border-warning/30 bg-warning/10 text-warning text-sm">
					<p className="font-medium mb-2">You recently generated a series from this idea.</p>
					<p className="text-warning/80 mb-3">Are you sure you want to generate another?</p>
					<div className="flex gap-3">
						<button
							onClick={() => handleGenerate(true)}
							className="px-4 py-2 rounded-lg bg-warning/20 hover:bg-warning/30 border border-warning/40 font-medium text-sm"
						>
							Generate anyway
						</button>
						<button
							onClick={() => setDuplicateWarning(false)}
							className="px-4 py-2 rounded-lg bg-surface/50 hover:bg-surface border border-edge/60 text-text-soft font-medium text-sm"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			<AnimatePresence mode="wait">

				{/* ── Step: Input ──────────────────────────────────────── */}
				{step === 'input' && (
					<motion.div key="input" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">

						{/* Brand selection */}
						<div className="card p-5">
							<label className="block text-sm font-medium mb-2">Brand</label>
							{brands.length === 0 ? (
								<p className="text-text-dim text-sm">No approved brands found. <a href="/onboarding" className="text-primary underline">Add a brand</a> first.</p>
							) : (
								<select
									value={selectedBrand}
									onChange={e => setSelectedBrand(e.target.value)}
									className="w-full px-3 py-2 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none text-sm"
								>
									<option value="">Select a brand…</option>
									{brands.map(b => (
										<option key={b.id} value={b.id}>{b.client_name}</option>
									))}
								</select>
							)}
						</div>

						{/* Idea input */}
						<div className="card p-5">
							<label className="block text-sm font-medium mb-1">
								Your idea <span className="text-danger">*</span>
							</label>
							<p className="text-xs text-text-dim mb-3">Describe your idea in 1–3 sentences.</p>
							<textarea
								value={idea}
								onChange={e => setIdea(e.target.value)}
								placeholder="Why founders should build in public and how it accelerates learning."
								rows={4}
								maxLength={2000}
								className="w-full px-3 py-2 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 text-sm resize-none"
							/>
							<div className="text-right text-xs text-text-dim mt-1">{idea.length}/2000</div>
						</div>

						{/* Goal & Notes */}
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="card p-5">
								<label className="block text-sm font-medium mb-2">Goal <span className="text-text-dim">(optional)</span></label>
								<select
									value={goal}
									onChange={e => setGoal(e.target.value)}
									className="w-full px-3 py-2 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none text-sm"
								>
									<option value="">None</option>
									{GOAL_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
								</select>
							</div>
							<div className="card p-5">
								<label className="block text-sm font-medium mb-2">Notes / angle <span className="text-text-dim">(optional)</span></label>
								<textarea
									value={notes}
									onChange={e => setNotes(e.target.value)}
									placeholder="Include a contrarian take…"
									rows={2}
									maxLength={1000}
									className="w-full px-3 py-2 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none text-sm resize-none"
								/>
							</div>
						</div>

						{/* Channel selection */}
						<div className="card p-5">
							<label className="block text-sm font-medium mb-3">Channels</label>
							{planLoading ? (
								<div className="flex flex-wrap gap-2 text-text-dim text-sm">
									<Loader2 className="w-4 h-4 animate-spin" />
									<span>Loading channels…</span>
								</div>
							) : (
								<>
									<div className="flex flex-wrap gap-2">
										{allowedChannels.map(ch => {
											const selected = selectedChannels.includes(ch);
											return (
												<button
													key={ch}
													type="button"
													onClick={() => handleChannelToggle(ch)}
													className={`px-4 py-2 rounded-xl2 border text-sm font-medium transition flex items-center gap-2 ${
														selected
															? 'bg-primary/15 border-primary/40 text-primary'
															: 'bg-surface/30 border-edge/60 text-text-dim hover:text-text hover:bg-surface/50'
													}`}
												>
													<span>{CHANNEL_ICONS[ch]}</span>
													{ch}
													{selected && <Check className="w-3.5 h-3.5" />}
												</button>
											);
										})}
									</div>
									{userPlan === 'creator' && (
										<p className="text-xs text-text-dim mt-3 flex items-center gap-1">
											<Lock className="w-3 h-3" />
											Instagram &amp; Facebook require Growth or higher.
										</p>
									)}
								</>
							)}
						</div>

						{/* CTA */}
						<div className="flex justify-end">
							<button
								onClick={handleContinueToPreview}
								disabled={!selectedBrand || idea.trim().length < 10 || selectedChannels.length === 0}
								className="px-6 py-3 rounded-xl2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
							>
								<Zap className="w-4 h-4" />
								Preview series
							</button>
						</div>
					</motion.div>
				)}

				{/* ── Step: Preview ─────────────────────────────────────── */}
				{step === 'preview' && (
					<motion.div key="preview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
						<div className="card p-6">
							<h2 className="text-lg font-semibold mb-1">Your series will generate</h2>
							<p className="text-text-dim text-xs mb-4">
								Counts are based on your plan and remaining quota.
							</p>
							{quotaLoading ? (
								<div className="flex items-center gap-2 text-text-dim text-sm py-2">
									<Loader2 className="w-4 h-4 animate-spin" />
									<span>Checking quota…</span>
								</div>
							) : (
								<div className="space-y-3">
									{/* Active channels — channels with count > 0 */}
									{Object.entries(computedCounts).map(([ch, count]) => {
										const remaining = getQuotaRemainingForChannel(ch as ChannelKey);
										return (
											<div key={ch} className="flex items-center justify-between text-sm">
												<div className="flex items-center gap-2">
													<span>{CHANNEL_ICONS[ch]}</span>
													<span className="font-medium">{ch}</span>
													<span className="text-text-dim">× {count}</span>
													{remaining > 0 && remaining < 5 && (
														<span className="text-warning/80 text-xs">(quota low)</span>
													)}
												</div>
												<span className="text-text-dim text-xs">{remaining} remaining</span>
											</div>
										);
									})}

									{/* Dropped channels — zero quota or unsupported */}
									{droppedChannels.map(ch => (
										<div key={ch} className="flex items-center justify-between text-sm opacity-40">
											<div className="flex items-center gap-2">
												<span>{CHANNEL_ICONS[ch]}</span>
												<span className="line-through">{ch}</span>
												<span className="text-text-dim text-xs">× 0</span>
											</div>
											<span className="text-text-dim text-xs">quota used</span>
										</div>
									))}
								</div>
							)}
						</div>

						{/* Info: channels dropped due to quota */}
						{!quotaLoading && droppedChannels.length > 0 && !allChannelsZero() && (
							<div className="flex items-start gap-2 p-3 rounded-xl2 border border-warning/30 bg-warning/10 text-warning text-sm">
								<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
								<p>
									{droppedChannels.join(', ')} {droppedChannels.length === 1 ? 'was' : 'were'} omitted — monthly quota already used. The rest of your series will still be generated.
								</p>
							</div>
						)}

						{/* Hard block: all channels zero */}
						{!quotaLoading && allChannelsZero() && (
							<div className="flex items-start gap-2 p-4 rounded-xl2 border border-danger/30 bg-danger/10 text-danger text-sm">
								<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
								<div>
									<p className="font-medium">You've used your available quota for the selected channels this month.</p>
									<p className="text-danger/80 text-xs mt-1">Quota resets at the start of next month.</p>
								</div>
							</div>
						)}

						<div className="flex gap-3 justify-between">
							<button onClick={() => setStep('input')} className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text-soft hover:text-text text-sm">
								← Edit idea
							</button>
							<button
								onClick={() => handleGenerate(false)}
								disabled={submitting || allChannelsZero() || quotaLoading}
								className="px-6 py-3 rounded-xl2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-semibold disabled:opacity-40 flex items-center gap-2"
							>
								{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
								{submitting ? 'Starting…' : 'Generate series'}
							</button>
						</div>
					</motion.div>
				)}

				{/* ── Step: Generating (Live Generation Workspace) ────────── */}
			{step === 'generating' && (
				<motion.div key="generating" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
					{/* Header with progress */}
					<div className={`card p-6 ${runStatus === 'failed' ? 'border-danger/30' : ''}`}>
						<div className="flex items-start justify-between mb-4">
							<div>
								{runStatus === 'failed' ? (
									<>
										<h2 className="text-lg font-semibold mb-1 text-danger">Generation failed</h2>
										<p className="text-text-dim text-sm">{error || 'Something went wrong. Any partial results are shown below.'}</p>
									</>
								) : (
									<>
										<h2 className="text-lg font-semibold mb-1">Creating your content series</h2>
										<p className="text-text-dim text-sm">Turning your idea into channel-ready content.</p>
									</>
								)}
							</div>
							{totalExpected > 0 && runStatus !== 'failed' && (
								<div className="text-right">
									<div className="text-sm font-semibold text-text">{totalGenerated} of {totalExpected} ready</div>
									<div className="text-xs text-text-dim">{Math.round((totalGenerated / totalExpected) * 100)}% complete</div>
								</div>
							)}
						</div>

						{totalExpected > 0 && runStatus !== 'failed' && (
							<div className="space-y-2">
								<div className="w-full h-2 bg-edge/60 rounded-full overflow-hidden">
									<motion.div
										className="h-full bg-primary rounded-full"
										animate={{ width: `${Math.max(2, (totalGenerated / totalExpected) * 100)}%` }}
										transition={{ type: 'spring', stiffness: 50 }}
									/>
								</div>
								<p className="text-xs text-text-dim">
									{getStageMessage((totalGenerated / totalExpected) * 100, selectedChannels)}
								</p>
							</div>
						)}

						{runStatus === 'failed' && (
							<div className="flex gap-3 mt-4">
								<button
									type="button"
									onClick={() => {
										setError(null);
										setItems([]);
										setRunId('');
										setRunStatus('');
										setTotalExpected(0);
										setTotalGenerated(0);
										setStep('input');
									}}
									className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-text-soft font-medium text-sm transition-colors"
								>
									← Start over
								</button>
								<button
									type="button"
									onClick={() => {
										setError(null);
										setItems([]);
										setRunId('');
										setRunStatus('');
										setTotalExpected(0);
										setTotalGenerated(0);
										setStep('preview');
									}}
									className="px-4 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-sm transition-colors"
								>
									Try again
								</button>
							</div>
						)}
					</div>

					{/* Items grouped by channel (placeholders + ready) */}
					{Object.entries(
						items.reduce((acc, item) => {
							if (!acc[item.channel]) acc[item.channel] = [];
							acc[item.channel].push(item);
							return acc;
						}, {} as Record<string, SeriesItem[]>)
					).map(([channel, chItems]) => {
						const readyCount = chItems.filter(it => it.body_draft || it.status === 'ready').length;
						const totalCount = chItems.length;
						const channelComplete = readyCount === totalCount;
						return (
						<div key={channel}>
							<div className="flex items-center gap-2 mb-3">
								<span>{CHANNEL_ICONS[channel]}</span>
								<span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PLATFORM_COLORS[channel] || 'text-text-dim border-edge/60 bg-surface/30'}`}>
									{channel}
								</span>
								{/* Channel progress badge */}
								<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
									channelComplete
										? 'bg-accent/20 text-accent border border-accent/30'
										: 'bg-edge/40 text-text-dim border border-edge/60'
								}`}>
									{readyCount}/{totalCount}
								</span>
								{channelComplete && (
									<span className="text-xs text-accent">✓</span>
								)}
							</div>
							<div className="space-y-3">
								{chItems.map(item => {
									const isReady = !!(item.body_draft || item.status === 'ready');
									const isFailedPlaceholder = item.status === 'failed' && !isReady;
									const isJustAdded = newlyReadyIds.has(item.id);
									
									if (!isReady) {
										if (isFailedPlaceholder) {
											return (
												<div key={item.id} className="card p-4 border border-danger/30 bg-danger/10">
													<div className="flex items-center justify-between">
														<div className="h-4 bg-danger/20 rounded w-2/3"></div>
														<span className="text-xs px-2 py-0.5 rounded-full bg-danger/20 text-danger border border-danger/30">
															Failed
														</span>
													</div>
													<div className="mt-3 space-y-2">
														<div className="h-3 bg-danger/10 rounded w-full"></div>
														<div className="h-3 bg-danger/10 rounded w-5/6"></div>
													</div>
												</div>
											);
										}

										// Skeleton placeholder
										return (
											<div key={item.id} className="card p-4 animate-pulse">
												<div className="h-4 bg-edge/40 rounded w-3/4 mb-3"></div>
												<div className="space-y-2">
													<div className="h-3 bg-edge/30 rounded w-full"></div>
													<div className="h-3 bg-edge/30 rounded w-5/6"></div>
													<div className="h-3 bg-edge/30 rounded w-4/6"></div>
												</div>
											</div>
										);
									}

									// Ready item - show actual content with optional "Just added" badge
									return (
										<div key={item.id} className="card p-4 border border-accent/20 bg-accent/5">
											<div className="flex items-start justify-between mb-2 gap-2">
												<h3 className="font-medium text-text flex-1">{item.post_title || 'Untitled'}</h3>
												<div className="flex items-center gap-1.5 shrink-0">
													{isJustAdded && (
														<span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 animate-pulse">
															Just added
														</span>
													)}
													<span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
														Ready
													</span>
												</div>
											</div>
											<p className="text-sm text-text-dim whitespace-pre-wrap line-clamp-3">
												{item.body_draft}
											</p>
											{item.hashtags && (
												<p className="text-xs text-primary/70 mt-2">{item.hashtags}</p>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);}
					)}

						{items.length === 0 && (
							<div className="card p-10 text-center">
								<div className="relative w-16 h-16 mx-auto mb-4">
									<div className="w-16 h-16 rounded-full border-2 border-primary/20 animate-pulse absolute inset-0" />
									<div className="w-16 h-16 rounded-full border-t-2 border-primary animate-spin absolute inset-0" />
									<Sparkles className="w-7 h-7 text-primary absolute inset-0 m-auto" />
								</div>
								<p className="text-text-dim text-sm">Loading your series...</p>
							</div>
						)}
					</motion.div>
				)}

				{/* ── Step: Review ──────────────────────────────────────── */}
				{step === 'review' && (
					<motion.div key="review" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="text-lg font-semibold">Review your series</h2>
								<p className="text-text-dim text-sm truncate max-w-md">"{idea.slice(0, 80)}{idea.length > 80 ? '…' : ''}"</p>
							</div>
							<span className="text-xs text-text-dim">{activeItems.length} items</span>
						</div>

						{/* Items grouped by channel */}
						{Object.entries(
							activeItems.reduce((acc, item) => {
								if (!acc[item.channel]) acc[item.channel] = [];
								acc[item.channel].push(item);
								return acc;
							}, {} as Record<string, SeriesItem[]>)
						).map(([channel, chItems]) => (
							<div key={channel}>
								<div className="flex items-center gap-2 mb-2">
									<span>{CHANNEL_ICONS[channel]}</span>
									<span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PLATFORM_COLORS[channel] || 'text-text-dim border-edge/60 bg-surface/30'}`}>
										{channel}
									</span>
									<span className="text-xs text-text-dim">{chItems.length} post{chItems.length !== 1 ? 's' : ''}</span>
								</div>
								<div className="space-y-3">
									{chItems.map(item => (
										<ItemCard
											key={item.id}
											item={item}
											onEdit={startEdit}
											onCancelEdit={cancelEdit}
											onUpdateDraft={updateDraft}
											onSaveEdit={saveEdit}
											onDelete={deleteItem}
											onRegenerate={regenerateItem}
										/>
									))}
								</div>
							</div>
						))}

						{activeItems.length === 0 && (
							<div className="card p-8 text-center">
								<p className="text-text-soft">All items removed. <button onClick={() => setStep('input')} className="text-primary underline">Start over</button></p>
							</div>
						)}

						{/* Actions */}
						<div className="flex items-center justify-between pt-2">
							<button
								onClick={handleCancel}
								className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text-soft hover:text-danger hover:border-danger/30 text-sm transition"
							>
								Cancel series
							</button>
							<button
								onClick={handleConfirm}
								disabled={confirming || activeItems.length === 0}
								className="px-6 py-3 rounded-xl2 bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent font-semibold disabled:opacity-40 flex items-center gap-2"
							>
								{confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
								{confirming ? 'Adding to queue…' : `Add ${activeItems.length} item${activeItems.length !== 1 ? 's' : ''} to queue`}
							</button>
						</div>
					</motion.div>
				)}

				{/* ── Step: Done ────────────────────────────────────────── */}
				{step === 'done' && (
					<motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
						<div className="card p-10 text-center flex flex-col items-center gap-5">
							<div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
								<CheckCircle2 className="w-8 h-8 text-accent" />
							</div>
							<div>
								<h2 className="text-xl font-semibold mb-2">Series added to your queue!</h2>
								<p className="text-text-dim">
									{queuedCount} item{queuedCount !== 1 ? 's' : ''} added to your Content Queue.
								</p>
							</div>
							<div className="flex gap-3">
								<a
									href="/content/approval"
									className="px-5 py-2.5 rounded-xl2 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-medium text-sm"
								>
									Review in queue
								</a>
								<button
									onClick={() => {
										setStep('input');
										setIdea('');
										setNotes('');
										setGoal('');
										setItems([]);
										setRunId('');
										setError(null);
									}}
									className="px-5 py-2.5 rounded-xl2 bg-surface/30 hover:bg-surface/50 border border-edge/60 text-text-soft font-medium text-sm"
								>
									New series
								</button>
							</div>
						</div>
					</motion.div>
				)}

			</AnimatePresence>
		</div>
	);
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

type ItemCardProps = {
	item: SeriesItem;
	onEdit: (id: string) => void;
	onCancelEdit: (id: string) => void;
	onUpdateDraft: (id: string, field: keyof SeriesItem['_editDraft'], value: string) => void;
	onSaveEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onRegenerate: (id: string) => void;
};

function ItemCard({ item, onEdit, onCancelEdit, onUpdateDraft, onSaveEdit, onDelete, onRegenerate }: ItemCardProps) {
	if (item._regenerating) {
		return (
			<div className="card p-4 opacity-60 flex items-center gap-3">
				<Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
				<span className="text-sm text-text-dim">Regenerating…</span>
			</div>
		);
	}

	if (item._editing) {
		return (
			<div className="card p-4 border border-primary/30 bg-primary/5 space-y-3">
				<input
					type="text"
					value={item._editDraft.post_title}
					onChange={e => onUpdateDraft(item.id, 'post_title', e.target.value)}
					placeholder="Title / hook"
					className="w-full px-3 py-1.5 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm focus:border-primary/60 focus:outline-none"
				/>
				<textarea
					value={item._editDraft.body_draft}
					onChange={e => onUpdateDraft(item.id, 'body_draft', e.target.value)}
					rows={6}
					placeholder="Post body…"
					className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm resize-none focus:border-primary/60 focus:outline-none"
				/>
				<input
					type="text"
					value={item._editDraft.hashtags}
					onChange={e => onUpdateDraft(item.id, 'hashtags', e.target.value)}
					placeholder="Hashtags"
					className="w-full px-3 py-1.5 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm focus:border-primary/60 focus:outline-none"
				/>
				{(item.channel === 'LinkedIn' || item.channel === 'Instagram') && (
					<input
						type="text"
						value={item._editDraft.image_prompt}
						onChange={e => onUpdateDraft(item.id, 'image_prompt', e.target.value)}
						placeholder="Image prompt"
						className="w-full px-3 py-1.5 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm focus:border-primary/60 focus:outline-none"
					/>
				)}
				<div className="flex gap-2 justify-end">
					<button onClick={() => onCancelEdit(item.id)} className="px-3 py-1.5 rounded-lg border border-edge/60 bg-surface/30 text-text-soft text-xs hover:text-text">
						Cancel
					</button>
					<button
						onClick={() => onSaveEdit(item.id)}
						disabled={item._saving}
						className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs hover:bg-primary/25 flex items-center gap-1 disabled:opacity-50"
					>
						{item._saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
						Save
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="card p-4 group">
			<div className="flex items-start justify-between gap-2 mb-2">
				<p className="text-sm font-semibold text-text line-clamp-2">{item.post_title || 'Untitled'}</p>
				<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
					<button
						onClick={() => onEdit(item.id)}
						title="Edit"
						className="p-1.5 rounded-lg hover:bg-primary/10 text-text-dim hover:text-primary transition"
					>
						<Edit3 className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => onRegenerate(item.id)}
						title="Regenerate"
						className="p-1.5 rounded-lg hover:bg-accent/10 text-text-dim hover:text-accent transition"
					>
						<RefreshCw className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => onDelete(item.id)}
						title="Remove"
						className="p-1.5 rounded-lg hover:bg-danger/10 text-text-dim hover:text-danger transition"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>
			<p className="text-xs text-text-soft line-clamp-4 whitespace-pre-line">
				{item.body_draft || <span className="italic text-text-dim">No content generated</span>}
			</p>
			{item.hashtags && (
				<p className="text-xs text-primary/70 mt-2">{item.hashtags}</p>
			)}
			{item.image_prompt && (
				<p className="text-xs text-text-dim mt-1 italic truncate">🖼 {item.image_prompt}</p>
			)}
			<div className="mt-2 text-[10px] text-text-dim">
				{item.series_position && item.series_total ? `${item.series_position} of ${item.series_total}` : ''}
			</div>
		</div>
	);
}
