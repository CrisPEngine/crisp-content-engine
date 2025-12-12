'use client';

/**
 * Master Strategy Form Editor Component
 * 
 * Replaces raw JSON editing with structured form-based editing
 * - Parses strategy_json into form state
 * - Renders editable sections: Brand & Positioning, Voice & Tone, Content Pillars, Platform Cadence, Guardrails
 * - Auto-saves with 800ms debounce
 * - Serializes back to JSON for Airtable
 */

import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { Save, Loader2, Check, Edit, Eye, Plus, X, AlertCircle } from 'lucide-react';
import { parseStrategyJson, serializeStrategyJson, type MasterStrategy, type ContentPillar, type PlatformCadence } from '@/lib/strategySchema';

type MasterStrategyFormEditorProps = {
	brandProfileId: string;
	initialStrategyJson: any;
};

type ViewMode = 'edit' | 'preview';

export function MasterStrategyFormEditor({ brandProfileId, initialStrategyJson }: MasterStrategyFormEditorProps) {
	const supabase = useSupabase();
	const [viewMode, setViewMode] = useState<ViewMode>('edit');
	const [strategy, setStrategy] = useState<MasterStrategy>(() => parseStrategyJson(initialStrategyJson));
	const [saving, setSaving] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [hasChanges, setHasChanges] = useState(false);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Initialize when initialStrategyJson changes
	useEffect(() => {
		if (initialStrategyJson) {
			const parsed = parseStrategyJson(initialStrategyJson);
			setStrategy(parsed);
			setHasChanges(false);
		}
	}, [initialStrategyJson]);

	// Auto-save with debounce
	useEffect(() => {
		if (!hasChanges || viewMode === 'preview') return;

		// Clear existing timeout
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		// Set new timeout
		saveTimeoutRef.current = setTimeout(() => {
			saveStrategy();
		}, 800); // 800ms debounce

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, [strategy, hasChanges, viewMode]);

	const updateField = (path: string[], value: any) => {
		setStrategy((prev) => {
			const updated = { ...prev };
			let current: any = updated;
			
			for (let i = 0; i < path.length - 1; i++) {
				if (!current[path[i]]) {
					current[path[i]] = {};
				}
				current = current[path[i]];
			}
			
			current[path[path.length - 1]] = value;
			return updated;
		});
		setHasChanges(true);
		setError(null);
	};

	const addPillar = () => {
		const newPillar: ContentPillar = {
			id: `pillar-${Date.now()}`,
			title: '',
			description: '',
			topics: [],
		};
		setStrategy((prev) => ({
			...prev,
			pillars: [...(prev.pillars || []), newPillar],
		}));
		setHasChanges(true);
	};

	const removePillar = (id: string) => {
		setStrategy((prev) => ({
			...prev,
			pillars: (prev.pillars || []).filter((p) => p.id !== id),
		}));
		setHasChanges(true);
	};

	const updatePillar = (id: string, field: keyof ContentPillar, value: any) => {
		setStrategy((prev) => ({
			...prev,
			pillars: (prev.pillars || []).map((p) =>
				p.id === id ? { ...p, [field]: value } : p
			),
		}));
		setHasChanges(true);
	};

	const addPlatformCadence = () => {
		const newCadence: PlatformCadence = {
			platform: '',
			postsPerWeek: 0,
			postingDays: [],
			bestTimes: [],
		};
		setStrategy((prev) => ({
			...prev,
			platform_cadence: [...(prev.platform_cadence || []), newCadence],
		}));
		setHasChanges(true);
	};

	const removePlatformCadence = (index: number) => {
		setStrategy((prev) => ({
			...prev,
			platform_cadence: (prev.platform_cadence || []).filter((_, i) => i !== index),
		}));
		setHasChanges(true);
	};

	const updatePlatformCadence = (index: number, field: keyof PlatformCadence, value: any) => {
		setStrategy((prev) => ({
			...prev,
			platform_cadence: (prev.platform_cadence || []).map((c, i) =>
				i === index ? { ...c, [field]: value } : c
			),
		}));
		setHasChanges(true);
	};

	const saveStrategy = async () => {
		if (!supabase || !brandProfileId) return;

		setSaving(true);
		setError(null);

		try {
			// Serialize form state to JSON
			const jsonToSave = serializeStrategyJson(strategy);

			const res = await fetch(`/api/strategy/${brandProfileId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					strategy_json: jsonToSave,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save strategy');
			}

			setLastSaved(new Date());
			setHasChanges(false);
		} catch (err: any) {
			console.error('Failed to save strategy:', err);
			setError(err.message || 'Failed to save strategy');
		} finally {
			setSaving(false);
		}
	};

	const formatLastSaved = () => {
		if (!lastSaved) return null;
		const now = new Date();
		const diff = now.getTime() - lastSaved.getTime();
		const seconds = Math.floor(diff / 1000);
		
		if (seconds < 60) return 'Just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return lastSaved.toLocaleDateString();
	};

	// Preview mode rendering
	if (viewMode === 'preview') {
		return (
			<div className="card p-6 space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Eye className="w-5 h-5 text-primary" />
						<h2 className="text-xl font-semibold">Master Strategy Preview</h2>
					</div>
					<button
						onClick={() => setViewMode('edit')}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
					>
						<Edit className="w-4 h-4" />
						Edit Strategy
					</button>
				</div>

				{/* Brand & Positioning */}
				<section className="space-y-3">
					<h3 className="text-lg font-semibold border-b border-edge/60 pb-2">Brand & Positioning</h3>
					{strategy.brand_name && (
						<div>
							<strong className="text-sm text-text-dim">Brand Name:</strong>
							<p className="mt-1">{strategy.brand_name}</p>
						</div>
					)}
					{strategy.audience && (
						<div>
							<strong className="text-sm text-text-dim">Target Audience:</strong>
							<p className="mt-1">{strategy.audience}</p>
						</div>
					)}
					{strategy.value_props && (
						<div>
							<strong className="text-sm text-text-dim">Value Propositions:</strong>
							<p className="mt-1">{strategy.value_props}</p>
						</div>
					)}
					{strategy.brand_goals && (
						<div>
							<strong className="text-sm text-text-dim">Brand Goals:</strong>
							<p className="mt-1">{strategy.brand_goals}</p>
						</div>
					)}
					{strategy.offers && (
						<div>
							<strong className="text-sm text-text-dim">Offers:</strong>
							<p className="mt-1">{strategy.offers}</p>
						</div>
					)}
				</section>

				{/* Voice & Tone */}
				<section className="space-y-3">
					<h3 className="text-lg font-semibold border-b border-edge/60 pb-2">Voice & Tone</h3>
					{strategy.voice_rules && (
						<div>
							<strong className="text-sm text-text-dim">Voice Rules:</strong>
							<p className="mt-1">{strategy.voice_rules}</p>
						</div>
					)}
					{strategy.tone && (
						<div>
							<strong className="text-sm text-text-dim">Tone:</strong>
							<p className="mt-1">{strategy.tone}</p>
						</div>
					)}
					{strategy.personality && strategy.personality.length > 0 && (
						<div>
							<strong className="text-sm text-text-dim">Personality Traits:</strong>
							<p className="mt-1">{strategy.personality.join(', ')}</p>
						</div>
					)}
				</section>

				{/* Content Pillars */}
				{Array.isArray(strategy.pillars) && strategy.pillars.length > 0 && (
					<section className="space-y-3">
						<h3 className="text-lg font-semibold border-b border-edge/60 pb-2">Content Pillars</h3>
						{strategy.pillars.map((pillar, index) => (
							<div key={pillar.id || index} className="p-4 rounded-xl2 border border-edge/60 bg-surface/30">
								<h4 className="font-medium mb-2">{pillar.title || `Pillar ${index + 1}`}</h4>
								{pillar.description && <p className="text-sm text-text-soft">{pillar.description}</p>}
								{pillar.topics && pillar.topics.length > 0 && (
									<div className="mt-2">
										<strong className="text-xs text-text-dim">Topics:</strong>
										<p className="text-sm text-text-soft">{pillar.topics.join(', ')}</p>
									</div>
								)}
							</div>
						))}
					</section>
				)}

				{/* Platform Cadence */}
				{(strategy.platform_cadence || []).length > 0 && (
					<section className="space-y-3">
						<h3 className="text-lg font-semibold border-b border-edge/60 pb-2">Platform Cadence</h3>
						{(strategy.platform_cadence || []).map((cadence, index) => (
							<div key={index} className="p-4 rounded-xl2 border border-edge/60 bg-surface/30">
								<h4 className="font-medium mb-2">{cadence.platform || `Platform ${index + 1}`}</h4>
								{cadence.postsPerWeek && (
									<p className="text-sm text-text-soft">{cadence.postsPerWeek} posts per week</p>
								)}
							</div>
						))}
					</section>
				)}

				{/* Guardrails */}
				<section className="space-y-3">
					<h3 className="text-lg font-semibold border-b border-edge/60 pb-2">Guardrails</h3>
					{Array.isArray(strategy.brand_keywords) && strategy.brand_keywords.length > 0 && (
						<div>
							<strong className="text-sm text-text-dim">Brand Keywords:</strong>
							<p className="mt-1 text-sm">{strategy.brand_keywords.join(', ')}</p>
						</div>
					)}
					{Array.isArray(strategy.exclude_keywords) && strategy.exclude_keywords.length > 0 && (
						<div>
							<strong className="text-sm text-text-dim">Exclude Keywords:</strong>
							<p className="mt-1 text-sm">{strategy.exclude_keywords.join(', ')}</p>
						</div>
					)}
					{strategy.content_rules && (
						<div>
							<strong className="text-sm text-text-dim">Content Rules:</strong>
							<p className="mt-1">{strategy.content_rules}</p>
						</div>
					)}
					{strategy.risk_tolerance && (
						<div>
							<strong className="text-sm text-text-dim">Risk Tolerance:</strong>
							<p className="mt-1">{strategy.risk_tolerance}</p>
						</div>
					)}
				</section>
			</div>
		);
	}

	// Edit mode rendering
	return (
		<div className="card p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Edit className="w-5 h-5 text-primary" />
					<h2 className="text-xl font-semibold">Master Strategy</h2>
				</div>
				<div className="flex items-center gap-3">
					{saving && (
						<div className="flex items-center gap-2 text-sm text-text-dim">
							<Loader2 className="w-4 h-4 animate-spin" />
							Saving...
						</div>
					)}
					{!saving && lastSaved && !hasChanges && (
						<div className="flex items-center gap-2 text-sm text-accent">
							<Check className="w-4 h-4" />
							Saved {formatLastSaved()}
						</div>
					)}
					{hasChanges && !saving && (
						<button
							onClick={saveStrategy}
							className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
						>
							<Save className="w-4 h-4" />
							Save Now
						</button>
					)}
					<button
						onClick={() => setViewMode('preview')}
						className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2 text-sm"
					>
						<Eye className="w-4 h-4" />
						Preview
					</button>
				</div>
			</div>

			{error && (
				<div className="p-3 rounded-xl2 border border-danger/40 bg-danger/10 text-sm text-danger flex items-start gap-2">
					<AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
					{error}
				</div>
			)}

			<div className="text-sm text-text-dim mb-4">
				Edit your master strategy. Changes are auto-saved after 800ms of inactivity.
			</div>

			{/* Brand & Positioning Section */}
			<section className="space-y-4 p-4 rounded-xl2 border border-edge/60 bg-surface/30">
				<h3 className="text-lg font-semibold">Brand & Positioning</h3>
				
				<div className="space-y-3">
					<div className="space-y-2">
						<label className="block text-sm font-medium">Brand Name</label>
						<input
							type="text"
							value={strategy.brand_name || ''}
							onChange={(e) => updateField(['brand_name'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							placeholder="Your brand name"
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Target Audience</label>
						<textarea
							rows={3}
							value={strategy.audience || ''}
							onChange={(e) => updateField(['audience'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							placeholder="Describe your target audience..."
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Value Propositions</label>
						<textarea
							rows={3}
							value={strategy.value_props || ''}
							onChange={(e) => updateField(['value_props'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							placeholder="What value do you provide to your audience?"
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Brand Goals</label>
						<textarea
							rows={3}
							value={strategy.brand_goals || ''}
							onChange={(e) => updateField(['brand_goals'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							placeholder="What are your brand's main goals?"
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Offers</label>
						<textarea
							rows={2}
							value={strategy.offers || ''}
							onChange={(e) => updateField(['offers'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							placeholder="Products, services, or offers to promote"
						/>
					</div>
				</div>
			</section>

			{/* Voice & Tone Section */}
			<section className="space-y-4 p-4 rounded-xl2 border border-edge/60 bg-surface/30">
				<h3 className="text-lg font-semibold">Voice & Tone</h3>
				
				<div className="space-y-3">
					<div className="space-y-2">
						<label className="block text-sm font-medium">Voice Rules</label>
						<textarea
							rows={4}
							value={strategy.voice_rules || ''}
							onChange={(e) => updateField(['voice_rules'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							placeholder="Describe how your brand should sound and communicate..."
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Tone</label>
						<input
							type="text"
							value={strategy.tone || ''}
							onChange={(e) => updateField(['tone'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							placeholder="e.g., Professional, Friendly, Authoritative"
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Personality Traits</label>
						<input
							type="text"
							value={Array.isArray(strategy.personality) ? strategy.personality.join(', ') : (strategy.personality || '')}
							onChange={(e) => {
								const traits = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
								updateField(['personality'], traits);
							}}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							placeholder="Comma-separated traits, e.g., Authentic, Bold, Empathetic"
						/>
						<p className="text-xs text-text-dim">Separate multiple traits with commas</p>
					</div>
				</div>
			</section>

			{/* Content Pillars Section */}
			<section className="space-y-4 p-4 rounded-xl2 border border-edge/60 bg-surface/30">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Content Pillars</h3>
					<button
						onClick={addPillar}
						className="px-3 py-1.5 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
					>
						<Plus className="w-4 h-4" />
						Add Pillar
					</button>
				</div>

				{Array.isArray(strategy.pillars) && strategy.pillars.length === 0 ? (
					<p className="text-sm text-text-dim">No content pillars yet. Add your first pillar above.</p>
				) : Array.isArray(strategy.pillars) ? (
					<div className="space-y-4">
						{strategy.pillars.map((pillar, index) => (
							<div key={pillar.id || index} className="p-4 rounded-xl2 border border-edge/60 bg-bg/50">
								<div className="flex items-center justify-between mb-3">
									<h4 className="font-medium">Pillar {index + 1}</h4>
									<button
										onClick={() => removePillar(pillar.id)}
										className="p-1 rounded-lg hover:bg-danger/10 text-danger"
									>
										<X className="w-4 h-4" />
									</button>
								</div>
								<div className="space-y-3">
									<div className="space-y-2">
										<label className="block text-xs font-medium text-text-dim">Title</label>
										<input
											type="text"
											value={pillar.title || ''}
											onChange={(e) => updatePillar(pillar.id, 'title', e.target.value)}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											placeholder="Pillar title"
										/>
									</div>
									<div className="space-y-2">
										<label className="block text-xs font-medium text-text-dim">Description</label>
										<textarea
											rows={3}
											value={pillar.description || ''}
											onChange={(e) => updatePillar(pillar.id, 'description', e.target.value)}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Describe this content pillar..."
										/>
									</div>
									<div className="space-y-2">
										<label className="block text-xs font-medium text-text-dim">Topics (comma-separated)</label>
										<input
											type="text"
											value={Array.isArray(pillar.topics) ? pillar.topics.join(', ') : ''}
											onChange={(e) => {
												const topics = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
												updatePillar(pillar.id, 'topics', topics);
											}}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											placeholder="Topic 1, Topic 2, Topic 3"
										/>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-text-dim">No content pillars yet. Add your first pillar above.</p>
				)}
			</section>

			{/* Platform Cadence Section */}
			<section className="space-y-4 p-4 rounded-xl2 border border-edge/60 bg-surface/30">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Platform Cadence</h3>
					<button
						onClick={addPlatformCadence}
						className="px-3 py-1.5 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
					>
						<Plus className="w-4 h-4" />
						Add Platform
					</button>
				</div>

				{Array.isArray(strategy.platform_cadence) && strategy.platform_cadence.length === 0 ? (
					<p className="text-sm text-text-dim">No platform cadence defined. Add platforms above.</p>
				) : Array.isArray(strategy.platform_cadence) ? (
					<div className="space-y-4">
						{strategy.platform_cadence.map((cadence, index) => (
							<div key={index} className="p-4 rounded-xl2 border border-edge/60 bg-bg/50">
								<div className="flex items-center justify-between mb-3">
									<h4 className="font-medium">Platform {index + 1}</h4>
									<button
										onClick={() => removePlatformCadence(index)}
										className="p-1 rounded-lg hover:bg-danger/10 text-danger"
									>
										<X className="w-4 h-4" />
									</button>
								</div>
								<div className="space-y-3">
									<div className="space-y-2">
										<label className="block text-xs font-medium text-text-dim">Platform Name</label>
										<input
											type="text"
											value={cadence.platform || ''}
											onChange={(e) => updatePlatformCadence(index, 'platform', e.target.value)}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											placeholder="e.g., LinkedIn, Instagram"
										/>
									</div>
									<div className="space-y-2">
										<label className="block text-xs font-medium text-text-dim">Posts Per Week</label>
										<input
											type="number"
											min="0"
											value={cadence.postsPerWeek || 0}
											onChange={(e) => updatePlatformCadence(index, 'postsPerWeek', parseInt(e.target.value) || 0)}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
										/>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Guardrails Section */}
			<section className="space-y-4 p-4 rounded-xl2 border border-edge/60 bg-surface/30">
				<h3 className="text-lg font-semibold">Guardrails</h3>
				
				<div className="space-y-3">
					<div className="space-y-2">
						<label className="block text-sm font-medium">Brand Keywords</label>
						<input
							type="text"
							value={Array.isArray(strategy.brand_keywords) ? strategy.brand_keywords.join(', ') : (strategy.brand_keywords || '')}
							onChange={(e) => {
								const keywords = e.target.value.split(',').map(k => k.trim()).filter(Boolean);
								updateField(['brand_keywords'], keywords);
							}}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							placeholder="Comma-separated keywords to emphasize"
						/>
						<p className="text-xs text-text-dim">Separate keywords with commas</p>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Exclude Keywords</label>
						<input
							type="text"
							value={Array.isArray(strategy.exclude_keywords) ? strategy.exclude_keywords.join(', ') : (strategy.exclude_keywords || '')}
							onChange={(e) => {
								const keywords = e.target.value.split(',').map(k => k.trim()).filter(Boolean);
								updateField(['exclude_keywords'], keywords);
							}}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							placeholder="Comma-separated keywords to avoid"
						/>
						<p className="text-xs text-text-dim">Separate keywords with commas</p>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Content Rules</label>
						<textarea
							rows={4}
							value={strategy.content_rules || ''}
							onChange={(e) => updateField(['content_rules'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							placeholder="Rules and guidelines for content creation..."
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Risk Tolerance</label>
						<select
							value={strategy.risk_tolerance || ''}
							onChange={(e) => updateField(['risk_tolerance'], e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
						>
							<option value="">Select risk tolerance...</option>
							<option value="Low risk (safe, neutral, reputation-protected)">Low risk (safe, neutral, reputation-protected)</option>
							<option value="Medium risk (balanced, industry-relevant opinions)">Medium risk (balanced, industry-relevant opinions)</option>
							<option value="High risk (strong viewpoints, controversial insights)">High risk (strong viewpoints, controversial insights)</option>
						</select>
					</div>
				</div>
			</section>
		</div>
	);
}
