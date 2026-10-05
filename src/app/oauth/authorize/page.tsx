'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ConsentForm() {
	const params = useSearchParams();
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState(false);
	const denied = (params.get('scope') ?? '').split(/[\s,]+/).filter((scope) => scope && !scope.startsWith('cce:'));

	async function authorize(allBrands: boolean) {
		setPending(true);
		setMessage('');
		const response = await fetch('/api/oauth/consent', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				clientId: params.get('client_id'),
				redirectUri: params.get('redirect_uri'),
				codeChallenge: params.get('code_challenge'),
				codeChallengeMethod: params.get('code_challenge_method'),
				scope: params.get('scope'),
				resource: params.get('resource'),
				state: params.get('state'),
				allBrands,
				brandIds: (params.get('brand_ids') ?? '').split(',').filter(Boolean),
			}),
		});
		const body = await response.json();
		if (!response.ok) {
			setMessage(body.error ?? 'Authorization failed.');
			setPending(false);
			return;
		}
		window.location.assign(body.redirectTo);
	}

	return (
		<div className="mx-auto max-w-xl p-6">
			<div className="card p-6 space-y-4">
				<h1 className="text-2xl font-semibold">Connect an AI assistant to CCE</h1>
				<p className="text-text-soft">The assistant can operate the brands you choose. It cannot approve, publish, or activate advertising.</p>
				<ul className="text-sm space-y-1">
					<li>Read brand intelligence</li>
					<li>Research</li>
					<li>Create drafts</li>
					<li>Request human approval</li>
				</ul>
				{denied.length > 0 ? <p className="text-sm">These requested permissions are not granted: {denied.join(', ')}</p> : null}
				<div className="flex gap-3">
					<button className="btn" disabled={pending} onClick={() => authorize(true)} type="button">Allow all my brands</button>
					<button className="btn" disabled={pending} onClick={() => authorize(false)} type="button">Allow selected brands</button>
				</div>
				{message ? <p className="text-sm">{message}</p> : null}
			</div>
		</div>
	);
}

export default function AuthorizePage() {
	return (
		<Suspense fallback={<div className="p-6">Loading authorization…</div>}>
			<ConsentForm />
		</Suspense>
	);
}
