'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { Trash2, Eye, Plus } from 'lucide-react';

type PreviewPack = {
	id: string;
	created_at: string;
	persona: string;
	tone: string;
	goal: string;
	channel: string;
	pack_title: string | null;
	status: string;
};

export default function PreviewsPage() {
	const router = useRouter();
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [packs, setPacks] = useState<PreviewPack[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase) return;
		
		const checkAuth = async () => {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/sign-in');
				return;
			}
			loadPacks();
		};
		
		checkAuth();
	}, [supabase, router]);

	async function loadPacks() {
		try {
			setLoading(true);
			setError(null);
			const res = await fetch('/api/preview/packs', { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load preview packs');
			}
			const data = await res.json();
			setPacks(data.packs || []);
		} catch (err: any) {
			console.error('Failed to load preview packs:', err);
			setError(err.message || 'Failed to load preview packs');
		} finally {
			setLoading(false);
		}
	}

	async function handleDelete(packId: string) {
		if (!confirm('Are you sure you want to delete this preview pack?')) return;
		
		try {
			setDeletingId(packId);
			const res = await fetch('/api/preview/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ previewPackId: packId }),
			});
			
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to delete preview pack');
			}
			
			// Reload packs
			await loadPacks();
		} catch (err: any) {
			console.error('Failed to delete preview pack:', err);
			alert(err.message || 'Failed to delete preview pack');
		} finally {
			setDeletingId(null);
		}
	}

	function formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			});
		} catch {
			return dateString;
		}
	}

	if (loading) {
		return (
			<main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
				<div className="max-w-4xl mx-auto">
					<div className="text-center py-12">
						<div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
						<p className="mt-4 text-sm text-neutral-300">Loading preview packs...</p>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
			<div className="max-w-4xl mx-auto">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-2xl font-semibold">Preview Packs</h1>
						<p className="mt-1 text-sm text-neutral-300">
							Manage your content previews before saving to workspace
						</p>
					</div>
					<button
						onClick={() => router.push('/preview')}
						className="flex items-center gap-2 rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-300"
					>
						<Plus className="w-4 h-4" />
						New Brief
					</button>
				</div>

				{error && (
					<div className="mb-6 rounded-xl bg-red-950/20 border border-red-800/50 p-4">
						<p className="text-sm text-red-300">{error}</p>
						<button
							onClick={loadPacks}
							className="mt-3 rounded-full bg-red-900/50 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/70"
						>
							Try again
						</button>
					</div>
				)}

				{packs.length === 0 ? (
					<div className="rounded-2xl bg-neutral-950/40 p-12 ring-1 ring-neutral-800 text-center">
						<p className="text-neutral-300 mb-4">No preview packs yet</p>
						<button
							onClick={() => router.push('/preview')}
							className="rounded-full bg-sky-400 px-6 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300"
						>
							Create your first preview
						</button>
					</div>
				) : (
					<div className="space-y-4">
						{packs.map((pack) => (
							<div
								key={pack.id}
								className="rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800 flex items-center justify-between gap-4"
							>
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<h3 className="text-sm font-semibold">
											{pack.pack_title || `Preview: ${pack.persona}`}
										</h3>
										<span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-1 rounded">
											{pack.channel}
										</span>
										{pack.status === 'converted' && (
											<span className="text-xs text-green-400 bg-green-950/20 px-2 py-1 rounded">
												Converted
											</span>
										)}
									</div>
									<div className="flex items-center gap-4 text-xs text-neutral-400">
										<span>{pack.persona}</span>
										<span>•</span>
										<span>{pack.tone}</span>
										<span>•</span>
										<span>{pack.goal}</span>
										<span>•</span>
										<span>{formatDate(pack.created_at)}</span>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<button
										onClick={() => router.push(`/preview?preview_pack_id=${pack.id}`)}
										className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 transition"
										title="View preview"
									>
										<Eye className="w-4 h-4" />
									</button>
									{pack.status !== 'converted' && (
										<button
											onClick={() => handleDelete(pack.id)}
											disabled={deletingId === pack.id}
											className="p-2 rounded-lg bg-neutral-900 hover:bg-red-900/20 text-neutral-300 hover:text-red-300 transition disabled:opacity-50"
											title="Delete preview"
										>
											<Trash2 className="w-4 h-4" />
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</main>
	);
}
