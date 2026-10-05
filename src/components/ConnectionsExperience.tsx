'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublishChannel } from '@/lib/social/channels';
import type { BrandChannelView, AccountAuthorizationView } from '@/lib/social/brandChannels';

type BrandRow = { id: string; name: string };

const STORAGE_KEY = 'cce.connections.selectedBrandId';

function statusClass(phase: BrandChannelView['phase']) {
	if (phase === 'READY') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
	if (phase === 'ASSIGNED') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
	if (phase === 'AUTHORIZED_UNASSIGNED') return 'bg-primary/10 text-primary border-primary/30';
	if (phase === 'ACTION_REQUIRED') return 'bg-warning/15 text-warning border-warning/30';
	return 'bg-surface border-edge/60 text-text-dim';
}

type Props = {
	initialBrandId?: string;
	oauthSuccess?: { channel?: string; account?: string; destinationId?: string; assigned?: boolean };
	error?: string | null;
	errorDetails?: string | null;
};

type DisconnectImpactState = {
	authorizationId: string;
	accountLabel: string;
	lines: { brandName: string; channel: string; destinationLabel: string }[];
	warning: string;
} | null;

export function isCurrentBrandResponse(
	requestId: number,
	currentRequestId: number,
	responseBrandId: string,
	currentBrandId: string
): boolean {
	return requestId === currentRequestId && responseBrandId === currentBrandId;
}

export function ConnectionsExperience({ initialBrandId, oauthSuccess, error, errorDetails }: Props) {
	const [brands, setBrands] = useState<BrandRow[]>([]);
	const [channels, setChannels] = useState<BrandChannelView[]>([]);
	const [accounts, setAccounts] = useState<AccountAuthorizationView[]>([]);
	const [destinations, setDestinations] = useState<Array<{ id: string; provider: string; destination_type: string; display_name: string; handle?: string | null }>>([]);
	const [selectedBrandId, setSelectedBrandId] = useState<string>(initialBrandId || '');
	const [loading, setLoading] = useState(true);
	const [brandLoading, setBrandLoading] = useState(false);
	const [saving, setSaving] = useState<string | null>(null);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showAccounts, setShowAccounts] = useState(false);
	const [dismissSuccess, setDismissSuccess] = useState(false);
	const [disconnectImpact, setDisconnectImpact] = useState<DisconnectImpactState>(null);
	const [disconnecting, setDisconnecting] = useState(false);
	const brandRequestId = useRef(0);
	const brandRequestController = useRef<AbortController | null>(null);
	const selectedBrandIdRef = useRef(selectedBrandId);
	selectedBrandIdRef.current = selectedBrandId;

	const loadBase = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/social/connections', { cache: 'no-store' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to load');
			const loadedBrands: BrandRow[] = data.brands || [];
			setBrands(loadedBrands);
			setDestinations(data.destinations || []);
			setAccounts(data.accounts || []);

			if (!initialBrandId && loadedBrands.length > 0) {
				const fromStorage = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
				const pick = initialBrandId || fromStorage || loadedBrands[0].id;
				setSelectedBrandId(pick);
			}
		} finally {
			setLoading(false);
		}
	}, [initialBrandId]);

	useEffect(() => {
		loadBase();
	}, [loadBase]);

	useEffect(() => {
		if (!selectedBrandId) return;
		if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, selectedBrandId);

		const requestId = ++brandRequestId.current;
		const controller = new AbortController();
		brandRequestController.current?.abort();
		brandRequestController.current = controller;
		setChannels([]);
		setBrandLoading(true);

		(async () => {
			try {
				const res = await fetch(`/api/social/connections?brandId=${encodeURIComponent(selectedBrandId)}`, {
					cache: 'no-store',
					signal: controller.signal,
				});
				const data = await res.json();
				if (
					res.ok &&
					isCurrentBrandResponse(requestId, brandRequestId.current, selectedBrandId, selectedBrandIdRef.current)
				) {
					setChannels(data.brandChannels || []);
					if (data.destinations) setDestinations(data.destinations);
					if (data.accounts) setAccounts(data.accounts);
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				if (isCurrentBrandResponse(requestId, brandRequestId.current, selectedBrandId, selectedBrandIdRef.current)) {
					setChannels([]);
				}
			} finally {
				if (isCurrentBrandResponse(requestId, brandRequestId.current, selectedBrandId, selectedBrandIdRef.current)) {
					setBrandLoading(false);
				}
			}
		})();

		return () => controller.abort();
	}, [selectedBrandId]);

	useEffect(() => {
		const ch = oauthSuccess?.channel;
		if (
			oauthSuccess?.destinationId &&
			selectedBrandId &&
			oauthSuccess.assigned === false &&
			(ch === 'instagram' || ch === 'threads')
		) {
			(async () => {
				await fetch('/api/social/connections', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						brandId: selectedBrandId,
						destinationId: oauthSuccess.destinationId,
						platform: ch === 'instagram' ? 'Instagram' : 'Threads',
					}),
				});
				// The brand-channel effect owns the read and will refresh the current brand safely.
			})();
		}
	}, [oauthSuccess, selectedBrandId]);

	async function openDisconnect(authorizationId: string) {
		const res = await fetch(`/api/social/connections/disconnect?authorizationId=${encodeURIComponent(authorizationId)}`);
		const data = await res.json();
		if (!res.ok) {
			alert(data.error || 'Could not load disconnect details');
			return;
		}
		setDisconnectImpact(data.impact);
	}

	async function confirmDisconnect() {
		if (!disconnectImpact) return;
		setDisconnecting(true);
		try {
			const res = await fetch('/api/social/connections/disconnect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ authorizationId: disconnectImpact.authorizationId }),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Disconnect failed');
			}
			setDisconnectImpact(null);
			setChannels([]);
			setBrandLoading(true);
			brandRequestController.current?.abort();
			brandRequestId.current += 1;
			const requestId = brandRequestId.current;
			const controller = new AbortController();
			brandRequestController.current = controller;
			const refresh = await fetch(`/api/social/connections?brandId=${encodeURIComponent(selectedBrandId)}`, {
				cache: 'no-store',
				signal: controller.signal,
			});
			const data = await refresh.json();
			if (refresh.ok && isCurrentBrandResponse(requestId, brandRequestId.current, selectedBrandId, selectedBrandIdRef.current)) {
				setChannels(data.brandChannels || []);
				setBrandLoading(false);
			}
			if (!refresh.ok) throw new Error(data.error || 'Could not refresh brand channels');
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Disconnect failed');
		} finally {
			setDisconnecting(false);
		}
	}

	function handleBrandChange(nextBrandId: string) {
		brandRequestController.current?.abort();
		brandRequestId.current += 1;
		setChannels([]);
		setBrandLoading(Boolean(nextBrandId));
		setSelectedBrandId(nextBrandId);
	}

	const connectedChannelLabel =
		oauthSuccess?.channel === 'threads' ? 'Threads' : oauthSuccess?.channel === 'instagram' ? 'Instagram' : 'Account';

	const selectedBrand = useMemo(() => brands.find((b) => b.id === selectedBrandId), [brands, selectedBrandId]);

	const destinationsForChannel = useCallback(
		(channel: PublishChannel) => {
			return destinations.filter((d) => {
				if (channel === 'facebook') return (d.provider === 'meta' || d.provider === 'facebook') && d.destination_type === 'page';
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

	async function saveDestination(channel: PublishChannel, destinationId: string) {
		if (!selectedBrandId) return;
		setSaving(channel);
		try {
			const platform =
				channel === 'facebook' ? 'Facebook' : channel === 'instagram' ? 'Instagram' : channel === 'threads' ? 'Threads' : 'LinkedIn';
			const res = await fetch('/api/social/connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ brandId: selectedBrandId, destinationId, platform }),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Save failed');
			}
			brandRequestController.current?.abort();
			brandRequestId.current += 1;
			setChannels([]);
			setBrandLoading(true);
			const requestId = brandRequestId.current;
			const controller = new AbortController();
			brandRequestController.current = controller;
			const refresh = await fetch(`/api/social/connections?brandId=${encodeURIComponent(selectedBrandId)}`, {
				cache: 'no-store',
				signal: controller.signal,
			});
			const data = await refresh.json();
			if (!refresh.ok) throw new Error(data.error || 'Could not refresh brand channels');
			if (isCurrentBrandResponse(requestId, brandRequestId.current, selectedBrandId, selectedBrandIdRef.current)) {
				setChannels(data.brandChannels || []);
				setBrandLoading(false);
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not save destination');
		} finally {
			setSaving(null);
			setBrandLoading(false);
		}
	}

	if (loading && brands.length === 0) {
		return <div className="card p-8 animate-pulse h-48" />;
	}

	return (
		<div className="space-y-6">
			{error && (
				<div className="card p-4 border-danger/40 bg-danger/10 text-sm">
					<p className="font-medium text-danger">Connection error</p>
					<p className="text-text-dim mt-1">{error}</p>
					{errorDetails && <p className="text-xs text-text-dim mt-2">{decodeURIComponent(errorDetails)}</p>}
				</div>
			)}

			{oauthSuccess?.account && !dismissSuccess && (
				<div className="card p-4 border-emerald-500/40 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div>
						<p className="font-medium text-emerald-300">{connectedChannelLabel} connected</p>
						<p className="text-sm text-text-dim mt-1">
							{oauthSuccess.account.startsWith('@') ? oauthSuccess.account : `@${oauthSuccess.account}`} has been connected
							{selectedBrand ? ` to ${selectedBrand.name}` : ''}.
						</p>
					</div>
					<button type="button" className="text-sm px-3 py-1.5 rounded-lg border border-emerald-500/40" onClick={() => setDismissSuccess(true)}>
						Done
					</button>
				</div>
			)}

			{disconnectImpact && (
				<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
					<div className="card p-6 max-w-md w-full space-y-4 border-danger/30">
						<h3 className="text-lg font-semibold">Disconnect {disconnectImpact.accountLabel}?</h3>
						{disconnectImpact.lines.length > 0 ? (
							<div className="text-sm text-text-dim space-y-2">
								<p>This authorization currently provides:</p>
								<ul className="list-disc ml-5 space-y-1">
									{disconnectImpact.lines.map((line, i) => (
										<li key={i}>
											<span className="text-text">{line.brandName}</span> · {line.channel} → {line.destinationLabel}
										</li>
									))}
								</ul>
							</div>
						) : null}
						<p className="text-sm text-warning">{disconnectImpact.warning}</p>
						<div className="flex gap-2 justify-end">
							<button type="button" className="px-3 py-2 rounded-lg border border-edge/60 text-sm" onClick={() => setDisconnectImpact(null)}>
								Cancel
							</button>
							<button
								type="button"
								className="px-3 py-2 rounded-lg border border-danger/40 bg-danger/10 text-sm text-danger"
								disabled={disconnecting}
								onClick={confirmDisconnect}
							>
								{disconnecting ? 'Disconnecting…' : 'Disconnect account'}
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="card p-6 space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 className="text-xl font-semibold">Brand channels</h2>
						<p className="text-sm text-text-dim mt-1">Publishing destinations for the brand you select below.</p>
					</div>
					<label className="flex flex-col gap-1 text-sm w-full sm:w-auto">
						<span className="text-text-dim font-medium">Brand</span>
						<select
							className="rounded-lg bg-surface border border-edge/60 px-3 py-2.5 text-text min-w-[12rem]"
							value={selectedBrandId}
							onChange={(e) => handleBrandChange(e.target.value)}
						>
							{brands.length === 0 ? (
								<option value="">No brands yet</option>
							) : (
								brands.map((b) => (
									<option key={b.id} value={b.id}>
										{b.name}
									</option>
								))
							)}
						</select>
					</label>
				</div>

				{selectedBrand && !brandLoading && (
					<p className="text-sm font-semibold tracking-wide text-text-soft uppercase">{selectedBrand.name}</p>
				)}

				{brandLoading ? (
					<div className="space-y-4" aria-label="Loading brand channels">
						{[1, 2, 3, 4].map((item) => (
							<div key={item} className="h-28 rounded-xl2 border border-edge/60 bg-surface animate-pulse" />
						))}
					</div>
				) : (
					<ul className="space-y-4">
					{channels.map((row) => {
						const options = destinationsForChannel(row.channel);
						const hasAssignment = row.phase === 'READY' || row.phase === 'ASSIGNED' || row.phase === 'ACTION_REQUIRED';
						return (
							<li key={row.channel} className="rounded-xl2 border border-edge/60 p-4 space-y-3">
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div>
										<p className="text-xs font-semibold tracking-wider text-text-dim uppercase">{row.label}</p>
										{hasAssignment && row.destinationLabel && (
											<p className="text-lg font-semibold mt-1">{row.destinationLabel}</p>
										)}
										{row.authorizationLabel && hasAssignment && (
											<p className="text-xs text-text-dim mt-0.5">{row.authorizationLabel}</p>
										)}
									</div>
									<span className={`text-xs px-2.5 py-1 rounded-full border ${statusClass(row.phase)}`}>{row.uiStatus}</span>
								</div>

								{row.phase === 'AUTHORIZED_UNASSIGNED' && options.length > 0 && (
									<div className="space-y-2">
										<p className="text-sm text-text-dim">Choose which account this brand publishes to:</p>
										<select
											className="w-full rounded-lg bg-surface border border-edge/60 px-3 py-2 text-sm"
											defaultValue=""
											onChange={(e) => e.target.value && saveDestination(row.channel, e.target.value)}
											disabled={saving === row.channel}
										>
											<option value="">Select account…</option>
											{options.map((d) => (
												<option key={d.id} value={d.id}>
													{d.display_name}
												</option>
											))}
										</select>
									</div>
								)}

								{hasAssignment && options.length > 1 && (
									<div>
										<p className="text-xs text-text-dim mb-1">Change account</p>
										<select
											className="w-full rounded-lg bg-surface border border-edge/60 px-3 py-2 text-sm"
											value={row.destinationId || ''}
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

								<div className="flex flex-wrap gap-2 pt-1">
									{row.phase === 'NOT_CONNECTED' && row.connectHref && (
										<a href={row.connectHref} className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-sm">
											Connect {row.label}
										</a>
									)}
									{(row.phase === 'AUTHORIZED_UNASSIGNED' || hasAssignment) && row.addAccountHref && (
										<a href={row.addAccountHref} className="px-3 py-1.5 rounded-lg border border-edge/60 text-sm text-text-dim">
											Add another {row.label} account
										</a>
									)}
								</div>

								{row.advancedProviderId && showAdvanced && (
									<p className="text-xs font-mono text-text-dim/70">Provider ID: {row.advancedProviderId}</p>
								)}
							</li>
						);
					})}
					</ul>
				)}

				<button type="button" className="text-xs text-text-dim underline" onClick={() => setShowAdvanced((v) => !v)}>
					{showAdvanced ? 'Hide' : 'Show'} advanced details
				</button>
			</div>

			<div className="card p-6">
				<button type="button" className="w-full flex items-center justify-between text-left" onClick={() => setShowAccounts((v) => !v)}>
					<span className="font-semibold">Manage connected accounts</span>
					<span className="text-text-dim text-sm">{showAccounts ? '−' : '+'}</span>
				</button>
				{showAccounts && (
					<ul className="mt-4 space-y-4">
						{accounts.length === 0 && <p className="text-sm text-text-dim">No OAuth authorizations yet.</p>}
						{accounts.map((acct) => (
							<li key={acct.id} className="rounded-xl2 border border-edge/60 p-4 space-y-2">
								<p className="text-xs uppercase tracking-wide text-text-dim">{acct.providerLabel}</p>
								<p className="text-lg font-semibold">{acct.primaryLabel}</p>
								<p className="text-xs text-text-dim">
									{acct.status === 'CONNECTED' ? 'Authorized' : acct.status}
									{acct.expiresAt ? ` · Expires ${new Date(acct.expiresAt).toLocaleDateString()}` : ''}
								</p>
								{acct.destinations.length > 0 && (
									<p className="text-xs text-text-dim">
										Destinations: {acct.destinations.map((d) => d.label).join(', ')}
									</p>
								)}
								{acct.usedByBrands.length > 0 && (
									<p className="text-xs text-text-dim">Used by: {acct.usedByBrands.join(', ')}</p>
								)}
								<div className="pt-2">
									<button
										type="button"
										className="text-xs px-3 py-1.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10"
										onClick={() => openDisconnect(acct.id)}
									>
										Disconnect account
									</button>
								</div>
								{showAdvanced && acct.advancedAccountId && (
									<p className="text-xs font-mono text-text-dim/70">Account ID: {acct.advancedAccountId}</p>
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			<details className="card p-4 text-sm text-text-dim">
				<summary className="cursor-pointer font-medium text-text">Advanced · Legacy publishing defaults</summary>
				<p className="mt-3">
					Workspace-level Facebook Page and Instagram selection for legacy publishing. Prefer brand channels above.{' '}
					<a href="/connections/meta/select" className="text-primary underline">
						Legacy Page &amp; Instagram defaults
					</a>
				</p>
			</details>
		</div>
	);
}
