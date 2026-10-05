'use client';

import { useEffect, useState } from 'react';
import { CLIENT_COMPATIBILITY } from '@/lib/mcp/oauth';

type Credential = { id: string; name: string; scope: string; createdAt: string; lastUsedAt?: string; revokedAt?: string; capabilities: string[] };

export default function AiConnectionsPage() {
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [message, setMessage] = useState('');

	useEffect(() => {
		void fetch('/api/agent/v1/credentials')
			.then((response) => response.json())
			.then((body) => setCredentials(Array.isArray(body.credentials) ? body.credentials : []))
			.catch(() => setMessage('Sign in to manage AI connections.'));
	}, []);

	async function revoke(id: string) {
		const response = await fetch(`/api/agent/v1/credentials/${id}/revoke`, { method: 'POST' });
		if (!response.ok) {
			setMessage('That connection could not be revoked.');
			return;
		}
		setCredentials((current) => current.map((item) => (item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item)));
	}

	return (
		<div className="mx-auto max-w-4xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">AI Connections</h1>
				<p className="text-text-soft">Connect your CCE brands and content intelligence to compatible AI assistants. CCE remains the system of record.</p>
			</div>
			<section className="card p-4 space-y-2">
				<h2 className="font-medium">MCP endpoint</h2>
				<p className="text-sm">https://app.crispdigital.io/api/mcp</p>
				<p className="text-sm">Existing bearer credentials keep working. Supported clients can also use OAuth with PKCE. Approval, publishing, and ad activation are never granted from a client request.</p>
			</section>
			<section className="space-y-3">
				{CLIENT_COMPATIBILITY.map((client) => (
					<article className="card p-4" key={client.client}>
						<h2 className="font-medium">{client.client} · {client.status}</h2>
						<p className="text-sm">{client.auth}</p>
						<p className="text-xs text-text-soft">Checked {client.checkedOn}. Evidence: {client.evidence}.</p>
					</article>
				))}
			</section>
			<section className="space-y-3">
				<h2 className="font-medium">Connected assistants</h2>
				{credentials.length === 0 ? <p className="text-sm">No connections yet.</p> : null}
				{credentials.map((credential) => (
					<article className="card p-4 space-y-1" key={credential.id}>
						<h3 className="font-medium">{credential.name}</h3>
						<p className="text-sm">{credential.scope} · connected {credential.createdAt.slice(0, 10)} · last used {credential.lastUsedAt?.slice(0, 10) ?? 'never'}</p>
						<p className="text-sm">{credential.revokedAt ? 'Revoked' : 'Active'}</p>
						{credential.revokedAt ? null : <button className="btn" type="button" onClick={() => revoke(credential.id)}>Disconnect</button>}
					</article>
				))}
				{message ? <p className="text-sm">{message}</p> : null}
			</section>
		</div>
	);
}
