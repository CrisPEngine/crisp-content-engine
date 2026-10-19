'use client';

import { useEffect, useState } from 'react';
import { CLIENT_COMPATIBILITY } from '@/lib/mcp/oauth';
import { CHIEF_OF_STAFF_CAPABILITIES, FOLIAN_GROK_CAPABILITIES } from '@/lib/agent/policy';
import { readWorkingBrandId } from '@/lib/brands/workingBrand';

type Credential = {
	id: string;
	name: string;
	scope?: string;
	allowedBrandIds: string[];
	capabilities: string[];
	keyPrefix: string;
	lastUsedAt?: string;
	revokedAt?: string;
};

type BrandOption = { id: string; name: string; airtableBrandId?: string };

export default function AiConnectionsPage() {
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [brands, setBrands] = useState<BrandOption[]>([]);
	const [name, setName] = useState('Marketing assistant');
	const [secret, setSecret] = useState<string | null>(null);
	const [message, setMessage] = useState('');
	const [rowBrandPick, setRowBrandPick] = useState<Record<string, string>>({});

	async function reload() {
		const [credentialResponse, brandResponse] = await Promise.all([
			fetch('/api/agent/v1/credentials'),
			fetch('/api/brand-assets'),
		]);
		if (credentialResponse.status === 401) {
			setMessage('Sign in to manage AI connections.');
			return;
		}
		const credentialBody = (await credentialResponse.json()) as { credentials?: Credential[] };
		const brandBody = (await brandResponse.json()) as { brands?: BrandOption[] };
		setCredentials(credentialBody.credentials ?? []);
		setBrands(brandBody.brands ?? []);
	}

	useEffect(() => {
		void reload();
	}, []);

	useEffect(() => {
		const working = readWorkingBrandId();
		if (working && brands.length) {
			const match = brands.find((b) => b.airtableBrandId === working || b.id === working);
			if (match) setRowBrandPick((prev) => ({ ...prev, __new: match.id }));
		}
	}, [brands]);

	function coverageLabel(credential: Credential): string {
		if (credential.scope === 'OWNER_ACCOUNT') return 'All my brands, including brands you add later';
		const names = credential.allowedBrandIds
			.map((id) => brands.find((b) => b.id === id)?.name ?? id.slice(0, 8))
			.filter(Boolean);
		return names.length ? names.join(', ') : 'No brands linked yet';
	}

	async function grantAllBrands(credentialId: string) {
		const response = await fetch(`/api/agent/v1/credentials/${credentialId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ grantAllBrands: true }),
		});
		if (!response.ok) {
			const body = (await response.json()) as { error?: string };
			setMessage(body.error ?? 'Could not update connection scope.');
			return;
		}
		await reload();
	}

	async function addBrandToCredential(credentialId: string) {
		const brandId = rowBrandPick[credentialId]?.trim();
		if (!brandId) {
			setMessage('Choose a brand from the list.');
			return;
		}
		const response = await fetch(`/api/agent/v1/credentials/${credentialId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ addBrandId: brandId }),
		});
		if (!response.ok) {
			const body = (await response.json()) as { error?: string };
			setMessage(body.error ?? 'Could not add brand to connection.');
			return;
		}
		await reload();
	}

	async function createAllBrandsCredential() {
		setMessage('');
		setSecret(null);
		const response = await fetch('/api/agent/v1/credentials', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, useChiefOfStaffPolicy: true }),
		});
		const body = (await response.json()) as { secret?: string; error?: string };
		if (!response.ok) {
			setMessage(body.error ?? 'Could not create the connection.');
			return;
		}
		setSecret(body.secret ?? null);
		await reload();
	}

	async function revoke(id: string) {
		await fetch(`/api/agent/v1/credentials/${id}/revoke`, { method: 'POST' });
		await reload();
	}

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Connect an assistant</h1>
				<p className="text-text-soft mt-2">
					Grant MCP or bearer access so an assistant can read strategy, research, and draft content. Approval and publishing stay human-only.
					CCE remains the system of record.
				</p>
			</div>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">MCP endpoint</h2>
				<p className="text-sm">https://app.crispdigital.io/api/mcp</p>
				<p className="text-sm text-text-soft">
					Supported clients can use OAuth with PKCE. Bearer tokens still work for scripts. Approval, publishing, and ad activation are never granted from a client request alone.
				</p>
			</section>

			<div className="card p-4 space-y-3">
				<h2 className="font-medium">Recommended: all brands</h2>
				<p className="text-sm text-text-soft">
					Covers every brand on your account, including brands you create later. OAuth connections may need a one-time reconnect after scope changes.
				</p>
				<label className="block text-sm">
					Connection name
					<input className="mt-1 w-full rounded border px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<p className="text-sm text-text-soft">Capabilities: {CHIEF_OF_STAFF_CAPABILITIES.join(', ')}</p>
				<button className="rounded bg-primary px-4 py-2 text-white" type="button" onClick={() => void createAllBrandsCredential()}>
					Connect assistant (all brands)
				</button>
			</div>

			{secret ? (
				<p className="text-sm break-all">Copy this secret now. It will not be shown again: {secret}</p>
			) : null}
			{message ? <p className="text-sm text-warning">{message}</p> : null}

			<section className="space-y-3">
				<h2 className="font-medium">Compatible clients</h2>
				{CLIENT_COMPATIBILITY.map((client) => (
					<article className="card p-4" key={client.client}>
						<h3 className="font-medium">
							{client.client} · {client.status}
						</h3>
						<p className="text-sm">{client.auth}</p>
						<p className="text-xs text-text-soft">
							Checked {client.checkedOn}. Evidence: {client.evidence}.
						</p>
					</article>
				))}
			</section>

			<div className="card p-4">
				<h2 className="font-medium mb-3">Connections</h2>
				{credentials.length === 0 ? <p className="text-sm text-text-soft">No connections yet.</p> : null}
				<ul className="space-y-4">
					{credentials.map((credential) => (
						<li key={credential.id} className="border-b pb-4">
							<div className="font-medium">{credential.name}</div>
							<div className="text-sm text-text-soft">
								Covers: {coverageLabel(credential)} · {credential.keyPrefix}… · last used{' '}
								{credential.lastUsedAt?.slice(0, 10) ?? 'never'} · {credential.revokedAt ? 'revoked' : 'active'}
							</div>
							<p className="text-xs text-text-soft mt-1">
								Capabilities:{' '}
								{(credential.capabilities.length ? credential.capabilities : FOLIAN_GROK_CAPABILITIES).join(', ')}
							</p>
							{credential.revokedAt ? null : (
								<div className="mt-3 flex flex-wrap gap-3 items-end">
									{credential.scope !== 'OWNER_ACCOUNT' ? (
										<>
											<label className="text-sm">
												Add a brand
												<select
													className="mt-1 block rounded border px-2 py-1"
													value={rowBrandPick[credential.id] ?? ''}
													onChange={(event) =>
														setRowBrandPick((prev) => ({ ...prev, [credential.id]: event.target.value }))
													}
												>
													<option value="">Choose brand</option>
													{brands.map((brand) => (
														<option key={brand.id} value={brand.id}>
															{brand.name}
														</option>
													))}
												</select>
											</label>
											<button className="text-sm underline" type="button" onClick={() => void addBrandToCredential(credential.id)}>
												Add brand
											</button>
											<button className="text-sm underline" type="button" onClick={() => void grantAllBrands(credential.id)}>
												Upgrade to all brands
											</button>
										</>
									) : null}
									<button className="text-sm underline" type="button" onClick={() => void revoke(credential.id)}>
										Disconnect
									</button>
								</div>
							)}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
