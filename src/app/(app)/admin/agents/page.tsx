'use client';

import { useEffect, useState } from 'react';
import { CHIEF_OF_STAFF_CAPABILITIES, FOLIAN_GROK_CAPABILITIES } from '@/lib/agent/policy';

type Credential = {
	id: string;
	name: string;
	scope?: string;
	allowedBrandIds: string[];
	capabilities: string[];
	keyPrefix: string;
	lastUsedAt?: string;
	revokedAt?: string;
	expiresAt?: string;
};

type AuditRow = {
	id: string;
	action: string;
	resultStatus: string;
	errorCode?: string;
	consequenceLevel?: number;
	createdAt: string;
};

export default function AgentCredentialsPage() {
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [audit, setAudit] = useState<AuditRow[]>([]);
	const [name, setName] = useState('Folian Marketing Grok');
	const [brandId, setBrandId] = useState('');
	const [chiefName, setChiefName] = useState('Chris Marketing Chief of Staff');
	const [secret, setSecret] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function reload() {
		const [credentialResponse, auditResponse] = await Promise.all([fetch('/api/agent/v1/credentials'), fetch('/api/agent/v1/audit')]);
		if (credentialResponse.status === 401) {
			setError('Sign in to manage agent credentials.');
			return;
		}
		const credentialBody = (await credentialResponse.json()) as { credentials?: Credential[] };
		const auditBody = (await auditResponse.json()) as { entries?: AuditRow[] };
		setCredentials(credentialBody.credentials ?? []);
		setAudit(auditBody.entries ?? []);
	}

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void reload();
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	async function createCredential(preset: 'folian' | 'chief') {
		setError(null);
		setSecret(null);
		const response = await fetch('/api/agent/v1/credentials', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(preset === 'chief'
				? { name: chiefName, useChiefOfStaffPolicy: true }
				: { name, allowedBrandIds: [brandId.trim()], useFolianPolicy: true }),
		});
		const body = (await response.json()) as { secret?: string; error?: string };
		if (!response.ok) {
			setError(body.error ?? 'Could not create the credential.');
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
				<h1 className="text-2xl font-semibold">Agent credentials</h1>
				<p className="text-text-soft mt-2">Create a brand-scoped key for an external operator. The secret is shown once. Folian policy can draft and propose. It cannot approve, publish, or change spend.</p>
			</div>
			<div className="card p-4 space-y-3">
				<label className="block text-sm">
					Name
					<input className="mt-1 w-full rounded border px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<label className="block text-sm">
					CCE brand id
					<input className="mt-1 w-full rounded border px-3 py-2" value={brandId} onChange={(event) => setBrandId(event.target.value)} placeholder="Canonical brand brain id" />
				</label>
				<p className="text-sm text-text-soft">Capabilities: {FOLIAN_GROK_CAPABILITIES.join(', ')}</p>
				<button className="rounded bg-primary px-4 py-2 text-white" type="button" onClick={() => void createCredential('folian')}>
					Create Folian operator credential
				</button>
			</div>
			<div className="card p-4 space-y-3">
				<h2 className="font-medium">Chris Marketing Chief of Staff</h2>
				<p className="text-sm text-text-soft">Scope is OWNER_ACCOUNT. It can reach brands this signed-in account owns, including brands created later. It cannot approve, publish, send replies, or change spend.</p>
				<label className="block text-sm">
					Name
					<input className="mt-1 w-full rounded border px-3 py-2" value={chiefName} onChange={(event) => setChiefName(event.target.value)} />
				</label>
				<p className="text-sm text-text-soft">Capabilities: {CHIEF_OF_STAFF_CAPABILITIES.join(', ')}</p>
				<button className="rounded bg-primary px-4 py-2 text-white" type="button" onClick={() => void createCredential('chief')}>
					Create Chief of Staff credential
				</button>
			</div>
			{secret ? <p className="text-sm break-all">Copy this secret now. It will not be shown again: {secret}</p> : null}
			{error ? <p className="text-sm">{error}</p> : null}
			<div className="card p-4">
				<h2 className="font-medium mb-3">Credentials</h2>
				<ul className="space-y-3">
					{credentials.map((credential) => (
						<li key={credential.id} className="border-b pb-3">
							<div className="font-medium">{credential.name}</div>
							<div className="text-sm text-text-soft">
								{credential.keyPrefix}… · {credential.scope ?? 'BRAND'} · brands {credential.allowedBrandIds.join(', ') || 'account brands'} · {credential.revokedAt ? 'revoked' : 'active'}
							</div>
							{credential.revokedAt ? null : (
								<button className="mt-2 text-sm underline" type="button" onClick={() => void revoke(credential.id)}>
									Revoke
								</button>
							)}
						</li>
					))}
				</ul>
			</div>
			<div className="card p-4">
				<h2 className="font-medium mb-3">Recent activity</h2>
				<ul className="space-y-2 text-sm">
					{audit.map((entry) => (
						<li key={entry.id}>
							{entry.createdAt} · {entry.action} · {entry.resultStatus}
							{entry.errorCode ? ` · ${entry.errorCode}` : ''} · level {entry.consequenceLevel ?? '—'}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
