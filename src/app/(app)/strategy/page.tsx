'use client';

/**
 * Strategy Management Page
 *
 * - Brand selector (for multi-brand accounts)
 * - Master Strategy: human-readable display via StrategyDisplay, with optional edit toggle
 * - Monthly Content Briefs: status + result_payload display via ContentBriefsSection
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { StrategyDisplay } from '@/components/StrategyDisplay';
import { MasterStrategyFormEditor } from '@/components/MasterStrategyFormEditor';
import { ContentBriefsSection } from '@/components/ContentBriefsSection';
import { Loader2, FileText, ClipboardList, ArrowLeft, ChevronDown, Edit, Eye } from 'lucide-react';

type Tab = 'master-strategy' | 'content-briefs';

type BrandProfile = {
	id: string;
	name: string;
	status?: string;
};

export default function StrategyPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = useSupabase();

	const [activeTab, setActiveTab] = useState<Tab>('master-strategy');
	const [brands, setBrands] = useState<BrandProfile[]>([]);
	const [brandProfileId, setBrandProfileId] = useState<string | null>(null);
	const [brandName, setBrandName] = useState<string>('');
	const [strategyJson, setStrategyJson] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [strategyLoading, setStrategyLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editMode, setEditMode] = useState(false);
	const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);

	// Initialise tab from query params
	useEffect(() => {
		const tabParam = searchParams.get('tab');
		setActiveTab(tabParam === 'content-briefs' ? 'content-briefs' : 'master-strategy');
	}, [searchParams]);

	// Load all brands on mount
	useEffect(() => {
		if (!supabase) return;
		loadBrands();
	}, [supabase]);

	async function loadBrands() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/brands', { cache: 'no-store' });
			if (!res.ok) throw new Error('Failed to load brands');
			const data = await res.json();
			const profiles: BrandProfile[] = (data.profiles || []).map((p: any) => ({
				id: p.id,
				name: p.client_name || p.brand_name || 'Unnamed Brand',
				status: p.status,
			}));
			setBrands(profiles);

			// Pick brand: honour query param, then first profile
			const queryBrandId = searchParams.get('brand_profile_id');
			const initial = queryBrandId
				? profiles.find((p) => p.id === queryBrandId) || profiles[0]
				: profiles[0];

			if (initial) {
				setBrandProfileId(initial.id);
				setBrandName(initial.name);
			} else {
				setError('No brand profiles found. Please complete onboarding first.');
				setLoading(false);
			}
		} catch (err: any) {
			setError(err.message || 'Failed to load brands');
			setLoading(false);
		}
	}

	// Load strategy whenever brandProfileId changes
	const loadStrategy = useCallback(async () => {
		if (!supabase || !brandProfileId) return;
		setStrategyLoading(true);
		setError(null);
		setStrategyJson(null);
		try {
			const res = await fetch(`/api/strategy/${brandProfileId}`, { cache: 'no-store' });
			if (!res.ok) throw new Error('Failed to load strategy');
			const data = await res.json();
			setStrategyJson(data.strategy_json);
			// Update brand name from API if available
			if (data.brand_name && data.brand_name !== 'Unknown Brand') {
				setBrandName(data.brand_name);
			}
		} catch (err: any) {
			setError(err.message || 'Failed to load strategy');
		} finally {
			setStrategyLoading(false);
			setLoading(false);
		}
	}, [supabase, brandProfileId]);

	useEffect(() => {
		if (brandProfileId) loadStrategy();
	}, [brandProfileId, loadStrategy]);

	function selectBrand(brand: BrandProfile) {
		setBrandProfileId(brand.id);
		setBrandName(brand.name);
		setBrandDropdownOpen(false);
		setEditMode(false);
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-5xl p-6">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading strategy...</p>
				</div>
			</div>
		);
	}

	if (error && !brandProfileId) {
		return (
			<div className="mx-auto max-w-5xl p-6">
				<div className="card p-8 border-danger/40 bg-danger/10 text-danger text-center">
					<p>{error}</p>
					<button
						onClick={() => router.push('/onboarding')}
						className="mt-4 px-4 py-2 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20"
					>
						Go to Onboarding
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<button onClick={() => router.back()} className="text-text-soft hover:text-text">
						<ArrowLeft className="w-5 h-5" />
					</button>
					<h1 className="text-3xl font-semibold">Strategy</h1>
				</div>
				<button
					onClick={() => router.push('/content-brief')}
					className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm font-medium"
				>
					Create Brief
				</button>
			</div>

			{/* Brand Selector — only shown when multiple brands */}
			{brands.length > 1 && (
				<div className="relative">
					<button
						onClick={() => setBrandDropdownOpen((o) => !o)}
						className="flex items-center gap-2 px-4 py-2.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm font-medium min-w-[200px] text-left"
					>
						<span className="flex-1 truncate">{brandName || 'Select brand'}</span>
						<ChevronDown className={`w-4 h-4 text-text-dim transition-transform ${brandDropdownOpen ? 'rotate-180' : ''}`} />
					</button>
					{brandDropdownOpen && (
						<div className="absolute top-full left-0 mt-1 z-20 w-64 rounded-xl2 border border-edge/60 bg-bg shadow-xl overflow-hidden">
							{brands.map((brand) => (
								<button
									key={brand.id}
									onClick={() => selectBrand(brand)}
									className={`w-full text-left px-4 py-3 text-sm hover:bg-surface/50 transition-colors flex items-center justify-between gap-2 ${
										brand.id === brandProfileId ? 'bg-primary/10 text-primary' : 'text-text'
									}`}
								>
									<span className="truncate">{brand.name}</span>
									{brand.id === brandProfileId && (
										<span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
									)}
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* Brand name heading for single-brand accounts */}
			{brands.length === 1 && brandName && (
				<div className="text-text-soft text-sm">
					Viewing strategy for <span className="font-medium text-text">{brandName}</span>
				</div>
			)}

			{/* Tabs */}
			<div className="flex gap-2 border-b border-edge/60">
				<button
					onClick={() => setActiveTab('master-strategy')}
					className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
						activeTab === 'master-strategy'
							? 'border-primary text-primary'
							: 'border-transparent text-text-dim hover:text-text'
					}`}
				>
					<div className="flex items-center gap-2">
						<FileText className="w-4 h-4" />
						Master Strategy
					</div>
				</button>
				<button
					onClick={() => setActiveTab('content-briefs')}
					className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
						activeTab === 'content-briefs'
							? 'border-primary text-primary'
							: 'border-transparent text-text-dim hover:text-text'
					}`}
				>
					<div className="flex items-center gap-2">
						<ClipboardList className="w-4 h-4" />
						Monthly Content Briefs
					</div>
				</button>
			</div>

			{/* Master Strategy tab */}
			{activeTab === 'master-strategy' && (
				<div>
					{strategyLoading ? (
						<div className="card p-8 text-center">
							<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
							<p className="text-text-soft">Loading master strategy...</p>
						</div>
					) : error ? (
						<div className="card p-6 border-danger/40 bg-danger/10 text-danger text-sm">{error}</div>
					) : editMode && brandProfileId ? (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<p className="text-sm text-text-dim">Edit your master strategy. Changes are auto-saved.</p>
								<button
									onClick={() => { setEditMode(false); loadStrategy(); }}
									className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2 text-sm text-text-soft"
								>
									<Eye className="w-3.5 h-3.5" />
									View Strategy
								</button>
							</div>
							<MasterStrategyFormEditor
								brandProfileId={brandProfileId}
								initialStrategyJson={strategyJson || {}}
							/>
						</div>
					) : brandProfileId ? (
						<div className="card p-6 space-y-6">
							<StrategyDisplay
								strategyJson={strategyJson}
								brandName={brandName}
								onEditClick={() => setEditMode(true)}
							/>
						</div>
					) : (
						<div className="card p-6 text-center text-text-dim">
							<p>No brand profile selected.</p>
						</div>
					)}
				</div>
			)}

			{/* Monthly Content Briefs tab */}
			{activeTab === 'content-briefs' && (
				<div>
					{brandProfileId ? (
						<ContentBriefsSection brandProfileId={brandProfileId} />
					) : (
						<div className="card p-6 text-center text-text-dim">
							<p>No brand profile selected.</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
