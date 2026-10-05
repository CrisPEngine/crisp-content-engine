'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { purposeForChannel, type PublishChannel } from '@/lib/social/channels';

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

type BrandChannelRow = {
	channel: PublishChannel;
	label: string;
	state: 'CONNECTED' | 'NOT_CONNECTED' | 'NOT_ASSIGNED' | 'ACTION_REQUIRED';
	destinationLabel?: string;
	destinationId?: string;
	connectHref?: string;
	addAccountHref?: string;
};

const ORDER: PublishChannel[] = ['instagram', 'threads', 'facebook', 'linkedin'];

export function BrandDestinationsPanel() {
	const [brands, setBrands] = useState<BrandRow[]>([]);
	const [destinations, setDestinations] = useState<DestinationRow[]>([]);
	const [links, setLinks] = useState<BrandLink[]>([]);
	const [channelRows, setChannelRows] = useState<BrandChannelRow[]>([]);
	const [selectedBrandId, setSelectedBrandId] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const brandQuery = selectedBrandId ? `?brandId=${encodeURIComponent(selectedBrandId)}` : '';
			const res = await fetch(`/api/social/connections${brandQuery}`, { cache: 'no-store' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to load connections');
			setBrands(data.brands || []);
			setDestinations(data.destinations || []);
			setLinks(data.brandDestinations || []);
			if (data.brandChannels) setChannelRows(data.brandChannels);
			if (!selectedBrandId && data.brands?.[0]?.id) {
				setSelectedBrandId(data.brands[0].id);
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to load');
		} finally {
			setLoading(false);
		}
	}, [selectedBrandId]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (!selectedBrandId) return;
		(async () => {
			const res = await fetch(`/api/social/connections?brandId=${encodeURIComponent(selectedBrandId)}`);
			const data = await res.json();
			if (res.ok && data.brandChannels) setChannelRows(data.brandChannels);
		})();
	}, [selectedBrandId]);

	const destinationsForChannel = useCallback(
		(channel: PublishChannel) => {
			return destinations.filter((d) => {
				if (channel === 'facebook')
					return (d.provider === 'meta' || d.provider === 'facebook') && d.destination_type === 'page';
				if (channel === 'instagram')
					return (
						(d.provider === 'instagram' && d.destination_type === 'instagram_professional') ||
						((d.provider === 'meta' || d.provider === 'facebook') && d.destination_type === 'instagram')
					);
				if (channel === 'threads') return d.provider === 'threads';
				if (channel === 'linkedin') return d.provider === 'linkedin';
				return false;
			});
		},
		[destinations]
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
				channel === 'facebook'
					? 'Facebook'
					: channel === 'instagram'
						? 'Instagram'
						: channel === 'threads'
							? 'Threads'
							: 'LinkedIn';
			const res = await fetch('/api/social/connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ brandId: selectedBrandId, destinationId, platform }),
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

	const rowsByChannel = useMemo(() => {
		const map = new Map(channelRows.map((r) => [r.channel, r]));
		return ORDER.map((ch) => map.get(ch)).filter(Boolean) as BrandChannelRow[];
	}, [channelRows]);

	if (loading && brands.length === 0) {
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
						Each channel has its own connection. Add accounts separately; change destination without replacing other brands.
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
			{selectedBrand && (
				<p className="text-sm font-medium text-text">{selectedBrand.name.toUpperCase()}</p>
			)}

			<ul className="space-y-4">
				{rowsByChannel.map((row) => {
					const options = destinationsForChannel(row.channel);
					const connected = row.state === 'CONNECTED';
					return (
						<li key={row.channel} className="rounded-xl2 border border-edge/60 p-4 space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="font-medium">{row.label}</span>
								<span
									className={
										connected
											? 'text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
											: row.state === 'NOT_ASSIGNED'
												? 'text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30'
												: 'text-xs px-2 py-1 rounded-full bg-surface border border-edge/60 text-text-dim'
									}
								>
									{connected ? 'Connected' : row.state === 'NOT_ASSIGNED' ? 'Choose destination' : 'Not connected'}
								</span>
							</div>

							{connected && row.destinationLabel && (
								<p className="text-sm text-text-dim">Publish to {row.destinationLabel}</p>
							)}

							{connected && options.length > 1 && (
								<div>
									<p className="text-xs text-text-dim mb-1">Change destination</p>
									<select
										className="w-full rounded-lg bg-surface border border-edge/60 px-3 py-2 text-sm"
										defaultValue={row.destinationId || ''}
										onChange={(e) => e.target.value && saveDestination(row.channel, e.target.value)}
										disabled={saving === row.channel}
									>
										{options.map((d) => (
											<option key={d.id} value={d.id}>
												{d.display_name}
											</option>
										))}
									</select>
								</div>
							)}

							{!connected && row.state === 'NOT_ASSIGNED' && options.length > 0 && (
								<select
									className="w-full rounded-lg bg-surface border border-edge/60 px-3 py-2 text-sm"
									defaultValue=""
									onChange={(e) => e.target.value && saveDestination(row.channel, e.target.value)}
									disabled={saving === row.channel}
								>
									<option value="">Select available destination…</option>
									{options.map((d) => (
										<option key={d.id} value={d.id}>
											{d.display_name}
										</option>
									))}
								</select>
							)}

							{!connected && (
								<div className="flex flex-wrap gap-2">
									{row.connectHref && (
										<a
											href={row.connectHref}
											className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
										>
											Connect {row.label}
										</a>
									)}
									{(row.channel === 'instagram' || row.channel === 'threads' || row.channel === 'facebook') &&
										row.addAccountHref &&
										connected && (
											<a
												href={row.addAccountHref}
												className="px-3 py-1.5 rounded-lg border border-edge/60 text-sm text-text-dim hover:bg-surface/80"
											>
												Add {row.label} account
											</a>
										)}
								</div>
							)}
						</li>
					);
				})}
			</ul>
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
				Connected account authorizations appear here after OAuth (Facebook Login, Instagram Login, Threads, LinkedIn).
			</div>
		);
	}

	const labelForProvider = (p: string) => {
		if (p === 'meta' || p === 'facebook') return 'Facebook Login';
		if (p === 'instagram') return 'Instagram Login';
		if (p === 'threads') return 'Threads';
		if (p === 'linkedin') return 'LinkedIn';
		return p;
	};

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
									<p className="font-medium">{labelForProvider(auth.provider)}</p>
									<p className="text-xs text-text-dim">Identity {auth.provider_account_id || auth.id.slice(0, 8)}</p>
								</div>
								<span className="text-xs text-text-dim">{auth.status}</span>
							</div>
							{auth.expires_at && (
								<p className="text-xs text-text-dim mt-1">Expires {new Date(auth.expires_at).toLocaleString()}</p>
							)}
							<p className="text-xs text-text-dim mt-2">
								{dests.length} destination{dests.length === 1 ? '' : 's'}
							</p>
						</li>
					);
				})}
			</ul>
			<div className="flex flex-wrap gap-2 text-sm">
				<a href="/api/meta/oauth/start" className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10">
					Add Facebook Login account
				</a>
				<a href="/api/connections/instagram/authorize" className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10">
					Add Instagram account
				</a>
				<a href="/api/connections/threads/authorize" className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10">
					Add Threads account
				</a>
			</div>
		</div>
	);
}
