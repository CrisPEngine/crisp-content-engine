'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { purposeForChannel, type PublishChannel } from '@/lib/social/channels';
import { isMetaPublishingEnabledClient } from '@/lib/featureFlags';

type BrandRow = { id: string; name: string };
type DestinationRow = {
	id: string;
	authorization_id: string;
	provider: string;
	destination_type: string;
	display_name: string;
	handle?: string | null;
};
type BrandLink = { brand_id: string; destination_id: string; purpose: string; enabled: boolean };

const CHANNELS: { key: PublishChannel; label: string; platforms: string[] }[] = [
	{ key: 'linkedin', label: 'LinkedIn', platforms: ['linkedin'] },
	{ key: 'facebook', label: 'Facebook', platforms: ['meta'] },
	{ key: 'instagram', label: 'Instagram', platforms: ['meta'] },
	{ key: 'x', label: 'X', platforms: ['x'] },
];

function channelLabel(channel: PublishChannel) {
	return CHANNELS.find((c) => c.key === channel)?.label || channel;
}

export function BrandDestinationsPanel() {
	const [brands, setBrands] = useState<BrandRow[]>([]);
	const [destinations, setDestinations] = useState<DestinationRow[]>([]);
	const [links, setLinks] = useState<BrandLink[]>([]);
	const [selectedBrandId, setSelectedBrandId] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/social/connections', { cache: 'no-store' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to load connections');
			setBrands(data.brands || []);
			setDestinations(data.destinations || []);
			setLinks(data.brandDestinations || []);
			if (!selectedBrandId && data.brands?.[0]?.id) {
				setSelectedBrandId(data.brands[0].id);
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to load');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const destinationsForChannel = useCallback(
		(channel: PublishChannel) => {
			return destinations.filter((d) => {
				if (channel === 'facebook') return d.provider === 'meta' && d.destination_type === 'page';
				if (channel === 'instagram') return d.provider === 'meta' && d.destination_type === 'instagram';
				if (channel === 'linkedin') return d.provider === 'linkedin';
				return false;
			});
		},
		[destinations]
	);

	const linkForChannel = useCallback(
		(brandId: string, channel: PublishChannel) => {
			const purpose = purposeForChannel(channel);
			const link = links.find((l) => l.brand_id === brandId && l.purpose === purpose && l.enabled);
			if (!link) return null;
			return destinations.find((d) => d.id === link.destination_id) || null;
		},
		[links, destinations]
	);

	const selectedBrand = useMemo(
		() => brands.find((b) => b.id === selectedBrandId) || null,
		[brands, selectedBrandId]
	);

	async function saveDestination(channel: PublishChannel, destinationId: string) {
		if (!selectedBrandId) return;
		setSaving(channel);
		setError(null);
		try {
			const platform =
				channel === 'facebook' ? 'Facebook' : channel === 'instagram' ? 'Instagram' : 'LinkedIn';
			const res = await fetch('/api/social/connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandId: selectedBrandId,
					destinationId,
					platform,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Save failed');
			await load();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Save failed');
		} finally {
			setSaving(null);
		}
	}

	if (loading) {
		return (
			<div className="card p-6 animate-pulse">
				<div className="h-6 w-48 bg-surface/60 rounded mb-4" />
				<div className="h-10 bg-surface/60 rounded" />
			</div>
		);
	}

	return (
		<div className="card p-6 space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">Brand channels</h2>
					<p className="text-sm text-text-dim">
						Choose which connected account each brand publishes to. Authorizations stay separate under Accounts below.
					</p>
				</div>
				<label className="text-sm text-text-dim flex items-center gap-2">
					Brand
					<select
						className="rounded-lg bg-surface border border-edge/60 px-3 py-2 text-text"
						value={selectedBrandId}
						onChange={(e) => setSelectedBrandId(e.target.value)}
					>
						{brands.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</label>
			</div>

			{error && <p className="text-sm text-warning">{error}</p>}

			{!selectedBrand && <p className="text-sm text-text-dim">Create a brand to assign destinations.</p>}

			{selectedBrand && (
				<ul className="space-y-4">
					{CHANNELS.map(({ key, label }) => {
						const connected = linkForChannel(selectedBrandId, key);
						const options = destinationsForChannel(key);
						return (
							<li key={key} className="rounded-xl2 border border-edge/60 p-4 space-y-2">
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium">{label}</span>
									{connected ? (
										<span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
											Connected
										</span>
									) : (
										<span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30">
											Not assigned
										</span>
									)}
								</div>
								{connected && (
									<p className="text-sm text-text-dim">{connected.display_name}</p>
								)}
								{options.length > 0 ? (
									<div className="flex flex-col sm:flex-row gap-2">
										<select
											className="flex-1 rounded-lg bg-surface border border-edge/60 px-3 py-2 text-sm"
											defaultValue={connected?.id || ''}
											onChange={(e) => {
												if (e.target.value) saveDestination(key, e.target.value);
											}}
											disabled={saving === key}
										>
											<option value="">Select destination…</option>
											{options.map((d) => (
												<option key={d.id} value={d.id}>
													{d.display_name}
													{d.handle ? ` (@${d.handle.replace(/^@/, '')})` : ''}
												</option>
											))}
										</select>
										{saving === key && (
											<span className="text-xs text-text-dim self-center">Saving…</span>
										)}
									</div>
								) : (
									<p className="text-xs text-text-dim">
										No {label} destinations yet. Connect an account below, then return here.
									</p>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

export function AuthorizationAccountsPanel() {
	const [authorizations, setAuthorizations] = useState<
		{ id: string; provider: string; provider_account_id?: string; status: string; expires_at?: string }[]
	>([]);
	const [destinations, setDestinations] = useState<DestinationRow[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		(async () => {
			const res = await fetch('/api/social/connections');
			const data = await res.json();
			if (res.ok) {
				setAuthorizations(data.authorizations || []);
				setDestinations(data.destinations || []);
			}
			setLoading(false);
		})();
	}, []);

	if (loading) return null;

	if (authorizations.length === 0) {
		return (
			<div className="card p-6 text-sm text-text-dim">
				Native authorization records will appear here after you connect Meta or LinkedIn (sync runs automatically).
			</div>
		);
	}

	return (
		<div className="card p-6 space-y-4">
			<h2 className="text-xl font-semibold">Connected accounts</h2>
			<ul className="space-y-3">
				{authorizations.map((auth) => {
					const dests = destinations.filter((d) => d.authorization_id === auth.id);
					return (
						<li key={auth.id} className="rounded-xl2 border border-edge/60 p-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<p className="font-medium capitalize">{auth.provider}</p>
									<p className="text-xs text-text-dim">Account {auth.provider_account_id || auth.id.slice(0, 8)}</p>
								</div>
								<span className="text-xs text-text-dim">{auth.status}</span>
							</div>
							{auth.expires_at && (
								<p className="text-xs text-text-dim mt-1">
									Token expiry: {new Date(auth.expires_at).toLocaleString()}
								</p>
							)}
							<p className="text-xs text-text-dim mt-2">
								{dests.length} destination{dests.length === 1 ? '' : 's'} available
							</p>
						</li>
					);
				})}
			</ul>
			{isMetaPublishingEnabledClient() && (
				<a
					href="/api/meta/oauth/start"
					className="inline-flex px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
				>
					Add Meta account
				</a>
			)}
		</div>
	);
}
