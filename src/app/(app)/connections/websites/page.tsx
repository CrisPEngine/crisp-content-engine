'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DestinationSettings, ProviderCapabilities, WebsiteDestinationView } from '@/lib/destinations/types';

type Brand = { id: string; name?: string };
type Provider = { id: string; label: string; available: boolean; note: string; capabilities: ProviderCapabilities };
type Toast = { kind: 'ok' | 'error'; text: string };

const CAPABILITY_LABELS: Array<[keyof ProviderCapabilities, string]> = [
	['testConnection', 'Connection test'],
	['taxonomy', 'Category sync'],
	['draftLookup', 'Draft lookup'],
	['draftSubmission', 'Draft submission'],
	['mediaUpload', 'Media upload'],
	['scheduling', 'Scheduling'],
	['publishing', 'Publishing'],
];

const HEALTH_STYLES: Record<string, string> = {
	healthy: 'text-accent',
	degraded: 'text-warning',
	error: 'text-danger',
	disabled: 'text-text-dim',
	unknown: 'text-text-soft',
};

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
	const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return { ok: response.ok, payload: await response.json().catch(() => ({})) };
}

function DestinationCard({ destination, onSaved, notify }: { destination: WebsiteDestinationView; onSaved: () => Promise<void>; notify: (toast: Toast) => void }) {
	const [pending, setPending] = useState('');
	const [connection, setConnection] = useState({ name: destination.name, baseUrl: destination.baseUrl ?? '', apiKey: '', bypassToken: '' });
	const [settings, setSettings] = useState<DestinationSettings>(destination.settings);
	const [newMapping, setNewMapping] = useState({ topic: '', categoryId: '' });
	const environment = destination.credentialSource === 'environment';
	const categories = destination.taxonomy?.categories ?? [];
	const settingsDirty = JSON.stringify(settings) !== JSON.stringify(destination.settings);
	const connectionDirty = connection.name !== destination.name || connection.baseUrl !== (destination.baseUrl ?? '') || Boolean(connection.apiKey) || Boolean(connection.bypassToken);
	const diff = destination.taxonomyDiff;

	async function run(label: string, method: 'PATCH' | 'POST', body: Record<string, unknown>, success: string) {
		setPending(label);
		const { ok, payload } = await send(`/api/websites/${destination.id}`, method, body);
		setPending('');
		if (!ok) {
			notify({ kind: 'error', text: String(payload.error ?? 'That did not work.') });
			return;
		}
		notify({ kind: 'ok', text: success });
		await onSaved();
	}

	const busy = pending !== '';
	return (
		<article className="card p-4 space-y-4">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h2 className="text-lg font-medium">{destination.name}</h2>
					<p className="text-xs text-text-soft">
						{destination.providerLabel} · key <code>{destination.key}</code> · {environment ? 'credentials from server environment' : destination.hasCredentials ? 'credentials stored encrypted' : 'no credentials'}
					</p>
				</div>
				<p className={`text-sm ${HEALTH_STYLES[destination.health.status] ?? ''}`}>
					{destination.enabled ? destination.health.status : 'disabled'}
					{destination.health.checkedAt ? ` · checked ${new Date(destination.health.checkedAt).toLocaleString()}` : ''}
					{destination.health.latencyMs != null ? ` · ${destination.health.latencyMs} ms` : ''}
				</p>
			</div>
			{destination.health.message ? <p className={`text-sm ${destination.health.status === 'error' ? 'text-danger' : ''}`}>{destination.health.message}</p> : null}
			{!destination.providerAvailable ? <p className="text-sm text-warning">This provider has no adapter yet. Articles cannot be sent here.</p> : null}

			<div className="flex flex-wrap gap-2">
				<button className="btn" type="button" disabled={busy || !destination.enabled} onClick={() => run('test', 'POST', { action: 'test' }, 'Connection tested.')}>{pending === 'test' ? 'Testing…' : 'Test connection'}</button>
				<button className="btn" type="button" disabled={busy || !destination.enabled} onClick={() => run('sync', 'POST', { action: 'sync_taxonomy' }, 'Categories synced from the CMS.')}>{pending === 'sync' ? 'Syncing…' : 'Sync categories'}</button>
				<button className="btn" type="button" disabled={busy} onClick={() => run('enable', 'PATCH', { enabled: !destination.enabled }, destination.enabled ? 'Destination disabled.' : 'Destination enabled.')}>
					{destination.enabled ? 'Disable' : 'Enable'}
				</button>
			</div>

			<div className="flex flex-wrap gap-1 text-xs">
				{CAPABILITY_LABELS.map(([key, label]) => (
					<span key={key} className={`rounded-full border px-2 py-0.5 ${destination.capabilities[key] ? 'border-accent/50' : 'border-edge text-text-dim'}`}>
						{label}: {destination.capabilities[key] ? 'yes' : key === 'publishing' ? 'no, publishing stays in the CMS' : 'no'}
					</span>
				))}
			</div>

			<details className="text-sm">
				<summary>Connection</summary>
				<div className="grid gap-3 md:grid-cols-2 pt-2">
					<label className="block">Name
						<input className="input w-full" value={connection.name} onChange={(event) => setConnection({ ...connection, name: event.target.value })} />
					</label>
					<label className="block">Base URL
						<input className="input w-full" value={connection.baseUrl} disabled={environment} onChange={(event) => setConnection({ ...connection, baseUrl: event.target.value })} />
					</label>
					{!environment ? (
						<>
							<label className="block">Replace API key <span className="text-xs text-text-soft">Stored encrypted. Never shown again.</span>
								<input className="input w-full" type="password" autoComplete="off" value={connection.apiKey} onChange={(event) => setConnection({ ...connection, apiKey: event.target.value })} />
							</label>
							<label className="block">Replace preview bypass token <span className="text-xs text-text-soft">Optional.</span>
								<input className="input w-full" type="password" autoComplete="off" value={connection.bypassToken} onChange={(event) => setConnection({ ...connection, bypassToken: event.target.value })} />
							</label>
						</>
					) : (
						<p className="text-xs text-text-soft md:col-span-2">The URL and key for this destination come from the server environment and are changed there.</p>
					)}
				</div>
				<button
					className="btn mt-2"
					type="button"
					disabled={busy || !connectionDirty}
					onClick={() =>
						run('connection', 'PATCH', {
							name: connection.name,
							...(environment ? {} : { baseUrl: connection.baseUrl }),
							...(connection.apiKey ? { apiKey: connection.apiKey } : {}),
							...(connection.bypassToken ? { bypassToken: connection.bypassToken } : {}),
						}, 'Connection saved.').then(() => setConnection((current) => ({ ...current, apiKey: '', bypassToken: '' })))
					}
				>
					Save connection
				</button>
			</details>

			<details className="text-sm" open={Boolean(diff && (diff.removed.length || diff.renamed.length || diff.missingDefault || diff.unmappedTopics.length))}>
				<summary>Categories ({categories.length}) {destination.taxonomySyncedAt ? `· synced ${new Date(destination.taxonomySyncedAt).toLocaleString()}` : '· never synced'}</summary>
				<p className="text-xs text-text-soft pt-2">The CMS is the source of truth. CCE does not create categories.</p>
				{diff ? (
					<div className="space-y-1 pt-2">
						{diff.added.map((item) => <p key={`a-${item.id}`}>New in CMS: {item.name} ({item.id})</p>)}
						{diff.removed.map((item) => <p key={`r-${item.id}`} className="text-danger">Removed from CMS: {item.name} ({item.id})</p>)}
						{diff.renamed.map((item) => <p key={`n-${item.id}`} className="text-warning">Renamed: {item.from} → {item.to} ({item.id})</p>)}
						{diff.missingDefault ? <p className="text-danger">The default category no longer exists. Choose another below.</p> : null}
						{diff.unmappedTopics.length ? <p className="text-danger">Topic mappings point to missing categories: {diff.unmappedTopics.join(', ')}</p> : null}
					</div>
				) : null}
				<table className="w-full text-sm mt-2">
					<thead><tr className="text-left text-text-soft"><th className="py-1">Name</th><th className="py-1">ID</th><th className="py-1">Description</th></tr></thead>
					<tbody>
						{categories.map((category) => (
							<tr key={category.id} className="border-t border-edge/40">
								<td className="py-1">{category.name}</td>
								<td className="py-1"><code>{category.id}</code></td>
								<td className="py-1 text-text-soft">{category.description}</td>
							</tr>
						))}
					</tbody>
				</table>
			</details>

			<details className="text-sm">
				<summary>Article settings {settingsDirty ? '· unsaved' : ''}</summary>
				<div className="grid gap-3 md:grid-cols-2 pt-2">
					<label className="block">Default category
						<select className="input w-full" value={settings.defaultCategoryId ?? ''} onChange={(event) => setSettings({ ...settings, defaultCategoryId: event.target.value || null })}>
							<option value="">None</option>
							{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
						</select>
					</label>
					<label className="block">Default author
						<input className="input w-full" value={settings.defaultAuthor} onChange={(event) => setSettings({ ...settings, defaultAuthor: event.target.value })} />
					</label>
					<label className="block">SEO title template <span className="text-xs text-text-soft">Use {'{title}'}.</span>
						<input className="input w-full" value={settings.seo.titleTemplate} onChange={(event) => setSettings({ ...settings, seo: { ...settings.seo, titleTemplate: event.target.value } })} />
					</label>
					<label className="block">Meta description limit
						<input className="input w-full" type="number" min={80} max={320} value={settings.seo.descriptionMaxLength} onChange={(event) => setSettings({ ...settings, seo: { ...settings.seo, descriptionMaxLength: Number(event.target.value) } })} />
					</label>
					<label className="block">Image delivery
						<select className="input w-full" value={settings.media.delivery} onChange={(event) => setSettings({ ...settings, media: { ...settings.media, delivery: event.target.value === 'url' ? 'url' : 'upload' } })}>
							<option value="upload">Upload to the CMS media library</option>
							<option value="url">Reference by URL</option>
						</select>
					</label>
					<label className="block">Allowed image hosts <span className="text-xs text-text-soft">Comma separated.</span>
						<input className="input w-full" value={settings.media.allowedImageHosts.join(', ')} onChange={(event) => setSettings({ ...settings, media: { ...settings.media, allowedImageHosts: event.target.value.split(',').map((host) => host.trim()).filter(Boolean) } })} />
					</label>
				</div>
				<div className="pt-3 space-y-1">
					<p className="font-medium">Topic mappings</p>
					<p className="text-xs text-text-soft">When an article topic contains the phrase, this category is suggested. A person still confirms it.</p>
					{settings.topicMappings.map((mapping, index) => (
						<div key={`${mapping.topic}-${index}`} className="flex flex-wrap items-center gap-2">
							<span>“{mapping.topic}” → {categories.find((category) => category.id === mapping.categoryId)?.name ?? `${mapping.categoryId} (missing)`}</span>
							<button className="underline text-xs" type="button" onClick={() => setSettings({ ...settings, topicMappings: settings.topicMappings.filter((_, position) => position !== index) })}>Remove</button>
						</div>
					))}
					<div className="flex flex-wrap gap-2 items-end">
						<input className="input" aria-label="Topic phrase" placeholder="Topic phrase" value={newMapping.topic} onChange={(event) => setNewMapping({ ...newMapping, topic: event.target.value })} />
						<select className="input" aria-label="Category for topic" value={newMapping.categoryId} onChange={(event) => setNewMapping({ ...newMapping, categoryId: event.target.value })}>
							<option value="">Category</option>
							{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
						</select>
						<button
							className="btn"
							type="button"
							disabled={!newMapping.topic.trim() || !newMapping.categoryId}
							onClick={() => {
								setSettings({ ...settings, topicMappings: [...settings.topicMappings, { topic: newMapping.topic.trim(), categoryId: newMapping.categoryId }] });
								setNewMapping({ topic: '', categoryId: '' });
							}}
						>
							Add mapping
						</button>
					</div>
				</div>
				<details className="pt-3">
					<summary>Field mappings</summary>
					<div className="grid gap-2 md:grid-cols-2 pt-2">
						{Object.entries(settings.fieldMappings).map(([field, target]) => (
							<label key={field} className="block">{field}
								<input className="input w-full" value={target} onChange={(event) => setSettings({ ...settings, fieldMappings: { ...settings.fieldMappings, [field]: event.target.value } })} />
							</label>
						))}
					</div>
				</details>
				<div className="flex gap-2 pt-3">
					<button className="btn" type="button" disabled={busy || !settingsDirty} onClick={() => run('settings', 'PATCH', { settings }, 'Settings saved.')}>{pending === 'settings' ? 'Saving…' : settingsDirty ? 'Save settings' : 'Settings saved'}</button>
					{settingsDirty ? <button className="btn" type="button" onClick={() => setSettings(destination.settings)}>Discard</button> : null}
				</div>
			</details>
		</article>
	);
}

export default function WebsitesPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [brandId, setBrandId] = useState('');
	const [destinations, setDestinations] = useState<WebsiteDestinationView[]>([]);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [toast, setToast] = useState<Toast | null>(null);
	const [loadError, setLoadError] = useState('');
	const [adding, setAdding] = useState({ name: '', provider: 'payload_content_api', baseUrl: '', apiKey: '', bypassToken: '' });
	const [pending, setPending] = useState(false);

	useEffect(() => {
		void fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then((body) => {
				if (body.error) {
					setLoadError('Sign in to manage website connections.');
					return;
				}
				const list = Array.isArray(body.brands) ? body.brands : [];
				setBrands(list);
				if (list[0]?.id) setBrandId(list[0].id);
			})
			.catch(() => setLoadError('Sign in to manage website connections.'));
	}, []);

	const load = useCallback(async () => {
		if (!brandId) return;
		const response = await fetch(`/api/websites?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			setLoadError(body.error ?? 'Destinations could not be loaded.');
			return;
		}
		setLoadError('');
		setDestinations(Array.isArray(body.destinations) ? body.destinations : []);
		setProviders(Array.isArray(body.providers) ? body.providers : []);
	}, [brandId]);

	useEffect(() => {
		void Promise.resolve().then(load);
	}, [load]);

	async function addDestination(event: React.FormEvent) {
		event.preventDefault();
		setPending(true);
		const { ok, payload } = await send('/api/websites', 'POST', { ...adding, brandId });
		setPending(false);
		if (!ok) {
			setToast({ kind: 'error', text: String(payload.error ?? 'The destination could not be added.') });
			return;
		}
		setToast({ kind: 'ok', text: 'Destination added. Test the connection, then sync categories.' });
		setAdding({ name: '', provider: 'payload_content_api', baseUrl: '', apiKey: '', bypassToken: '' });
		await load();
	}

	const provider = providers.find((item) => item.id === adding.provider);

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold">Websites & CMS</h1>
					<p className="text-text-soft">Each brand has its own destinations, categories and settings. CCE sends drafts; people publish in the CMS.</p>
				</div>
				<select className="input" aria-label="Brand" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
					{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name || brand.id}</option>)}
				</select>
			</div>
			<div aria-live="polite">
				{toast ? (
					<div className={`card p-3 text-sm flex justify-between gap-3 ${toast.kind === 'error' ? 'border-danger/60' : 'border-accent/60'}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
						<span>{toast.kind === 'ok' ? '✓ ' : ''}{toast.text}</span>
						<button type="button" className="text-xs underline" onClick={() => setToast(null)}>Dismiss</button>
					</div>
				) : null}
			</div>
			{loadError ? <p className="text-sm">{loadError}</p> : null}
			{brandId && !loadError && destinations.length === 0 ? <p className="text-sm">No destinations for this brand yet.</p> : null}
			{destinations.map((destination) => (
				<DestinationCard key={`${destination.id}-${destination.updatedAt}`} destination={destination} onSaved={load} notify={setToast} />
			))}

			{brandId && !loadError ? (
				<form className="card p-4 space-y-3" onSubmit={addDestination}>
					<h2 className="font-medium">Add a destination</h2>
					<div className="grid gap-3 md:grid-cols-2">
						<label className="block text-sm">CMS
							<select className="input w-full" value={adding.provider} onChange={(event) => setAdding({ ...adding, provider: event.target.value })}>
								{providers.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.label}{item.available ? '' : ' (not available yet)'}</option>)}
							</select>
						</label>
						<label className="block text-sm">Name
							<input className="input w-full" value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} required />
						</label>
						<label className="block text-sm">Base URL <span className="text-xs text-text-soft">Public https address only.</span>
							<input className="input w-full" value={adding.baseUrl} onChange={(event) => setAdding({ ...adding, baseUrl: event.target.value })} placeholder="https://" required />
						</label>
						<label className="block text-sm">API key <span className="text-xs text-text-soft">Stored encrypted on the server.</span>
							<input className="input w-full" type="password" autoComplete="off" value={adding.apiKey} onChange={(event) => setAdding({ ...adding, apiKey: event.target.value })} required />
						</label>
						<label className="block text-sm">Preview bypass token <span className="text-xs text-text-soft">Optional.</span>
							<input className="input w-full" type="password" autoComplete="off" value={adding.bypassToken} onChange={(event) => setAdding({ ...adding, bypassToken: event.target.value })} />
						</label>
					</div>
					{provider?.note ? <p className="text-xs text-text-soft">{provider.note}</p> : null}
					<button className="btn" type="submit" disabled={pending || !provider?.available}>{pending ? 'Adding…' : 'Add destination'}</button>
				</form>
			) : null}
		</div>
	);
}
