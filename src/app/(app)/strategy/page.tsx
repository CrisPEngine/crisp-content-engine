'use client';

/**
 * Strategy Management Page
 * 
 * Single home for:
 * - Viewing and editing Master Strategy
 * - Viewing and submitting Monthly Content Briefs
 * - Approving briefs and seeing status
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { MasterStrategyEditor } from '@/components/MasterStrategyEditor';
import { ContentBriefsSection } from '@/components/ContentBriefsSection';
import { Loader2, FileText, ClipboardList, ArrowLeft } from 'lucide-react';

type Tab = 'master-strategy' | 'content-briefs';

export default function StrategyPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = useSupabase();
	// Get initial tab from query params, default to master-strategy
	const initialTab = useMemo(() => {
		const tabParam = searchParams.get('tab');
		return (tabParam === 'content-briefs' ? 'content-briefs' : 'master-strategy') as Tab;
	}, [searchParams]);
	
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);
	
	// Update tab when query param changes
	useEffect(() => {
		const tabParam = searchParams.get('tab');
		if (tabParam === 'content-briefs') {
			setActiveTab('content-briefs');
		} else if (tabParam === 'master-strategy' || !tabParam) {
			setActiveTab('master-strategy');
		}
	}, [searchParams]);
	const [brandProfileId, setBrandProfileId] = useState<string | null>(null);
	const [strategyJson, setStrategyJson] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Get brand_profile_id and tab from query params
	useEffect(() => {
		const brandId = searchParams.get('brand_profile_id');
		if (brandId) {
			setBrandProfileId(brandId);
		} else {
			// If no brand_profile_id, try to get first brand
			loadFirstBrand();
		}
		
		// Set initial tab from query params
		const tabParam = searchParams.get('tab');
		if (tabParam === 'content-briefs') {
			setActiveTab('content-briefs');
		}
	}, [searchParams]);

	// Load strategy when brand_profile_id is available
	useEffect(() => {
		if (!supabase || !brandProfileId) return;
		loadStrategy();
	}, [supabase, brandProfileId]);

	async function loadFirstBrand() {
		if (!supabase) return;
		try {
			const res = await fetch('/api/brands', { cache: 'no-store' });
			if (res.ok) {
				const data = await res.json();
				const profiles = data.profiles || [];
				if (profiles.length > 0) {
					setBrandProfileId(profiles[0].id);
				} else {
					setError('No brand profiles found. Please complete onboarding first.');
				}
			}
		} catch (err) {
			console.error('Failed to load brands:', err);
		}
	}

	async function loadStrategy() {
		if (!supabase || !brandProfileId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/strategy/${brandProfileId}`, { cache: 'no-store' });
			if (!res.ok) {
				throw new Error('Failed to load strategy');
			}
			const data = await res.json();
			setStrategyJson(data.strategy_json);
		} catch (err: any) {
			console.error('Failed to load strategy:', err);
			setError(err.message || 'Failed to load strategy');
		} finally {
			setLoading(false);
		}
	}

	if (loading && !brandProfileId) {
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
					<button
						onClick={() => router.back()}
						className="text-text-soft hover:text-text"
					>
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

			{/* Tab Content */}
			{activeTab === 'master-strategy' && (
				<div>
					{loading ? (
						<div className="card p-8 text-center">
							<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
							<p className="text-text-soft">Loading master strategy...</p>
						</div>
					) : error ? (
						<div className="card p-6 border-danger/40 bg-danger/10 text-danger text-sm">
							{error}
						</div>
					) : strategyJson && brandProfileId ? (
						<MasterStrategyEditor
							brandProfileId={brandProfileId}
							initialStrategyJson={strategyJson}
						/>
					) : (
						<div className="card p-6 text-center text-text-dim">
							<p>No strategy found. Complete onboarding to generate your initial strategy.</p>
						</div>
					)}
				</div>
			)}

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
