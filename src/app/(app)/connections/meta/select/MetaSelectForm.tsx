'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Page = { id: string; page_id: string; page_name: string; is_selected: boolean };
type Instagram = { id: string; ig_user_id: string; ig_username: string; connected_page_id: string; is_selected: boolean };

export function MetaSelectForm({
	pages,
	instagramAccounts,
}: {
	pages: Page[];
	instagramAccounts: Instagram[];
}) {
	const router = useRouter();
	const [pageId, setPageId] = useState<string>(() => pages.find((p) => p.is_selected)?.page_id || pages[0]?.page_id || '');
	const [igUserId, setIgUserId] = useState<string>(() => {
		const selected = instagramAccounts.find((i) => i.is_selected);
		if (selected) return selected.ig_user_id;
		const forPage = instagramAccounts.filter((i) => i.connected_page_id === pageId);
		return forPage[0]?.ig_user_id || instagramAccounts[0]?.ig_user_id || '';
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const igForSelectedPage = instagramAccounts.filter((i) => i.connected_page_id === pageId);
	const effectiveIgUserId = igForSelectedPage.some((i) => i.ig_user_id === igUserId) ? igUserId : igForSelectedPage[0]?.ig_user_id || '';

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSaving(true);
		try {
			const resPage = await fetch('/api/meta/pages/select', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pageId }),
			});
			if (!resPage.ok) {
				const data = await resPage.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to select page');
			}

			if (effectiveIgUserId) {
				const resIg = await fetch('/api/meta/instagram-accounts/select', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ igUserId: effectiveIgUserId }),
				});
				if (!resIg.ok) {
					const data = await resIg.json().catch(() => ({}));
					throw new Error(data?.error || 'Failed to select Instagram account');
				}
			}

			router.push('/connections');
			router.refresh();
		} catch (err: any) {
			setError(err?.message || 'Something went wrong');
			setSaving(false);
		}
	};

	if (pages.length === 0) {
		return (
			<div className="card p-6 space-y-4">
				<p className="text-text-dim">No Facebook Pages found. Connect your Meta account first.</p>
				<Link href="/connections" className="text-primary hover:underline">
					← Back to Connections
				</Link>
			</div>
		);
	}

	return (
		<div className="card p-6 space-y-6">
			<div>
				<h2 className="text-xl font-semibold">Select Facebook Page & Instagram</h2>
				<p className="text-sm text-text-dim mt-1">
					Choose which Facebook Page and Instagram account to use for publishing. One of each per workspace.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				<div>
					<label className="block text-sm font-medium mb-2">Facebook Page</label>
					<select
						value={pageId}
						onChange={(e) => {
							setPageId(e.target.value);
							const igForNewPage = instagramAccounts.filter((i) => i.connected_page_id === e.target.value);
							setIgUserId(igForNewPage[0]?.ig_user_id || '');
						}}
						className="w-full rounded-xl border border-edge bg-bg px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
					>
						{pages.map((p) => (
							<option key={p.id} value={p.page_id}>
								{p.page_name}
							</option>
						))}
					</select>
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">Instagram Business Account</label>
					{igForSelectedPage.length === 0 ? (
						<p className="text-sm text-text-dim">No Instagram account linked to this Page.</p>
					) : (
						<select
							value={effectiveIgUserId}
							onChange={(e) => setIgUserId(e.target.value)}
							className="w-full rounded-xl border border-edge bg-bg px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
						>
							{igForSelectedPage.map((ig) => (
								<option key={ig.id} value={ig.ig_user_id}>
									@{ig.ig_username}
								</option>
							))}
						</select>
					)}
				</div>

				{error && (
					<div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
						{error}
					</div>
				)}

				<div className="flex gap-3">
					<button
						type="submit"
						disabled={saving}
						className="px-4 py-2 rounded-xl bg-primary text-primary-fg hover:opacity-90 disabled:opacity-60"
					>
						{saving ? 'Saving…' : 'Use these destinations'}
					</button>
					<Link
						href="/connections"
						className="px-4 py-2 rounded-xl border border-edge hover:bg-bg/80"
					>
						Cancel
					</Link>
				</div>
			</form>
		</div>
	);
}
