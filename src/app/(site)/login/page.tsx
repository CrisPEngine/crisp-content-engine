import { Suspense } from 'react';
import { LoginClient } from './LoginClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function LoginPage() {
	return (
		<Suspense fallback={
			<div className="mx-auto max-w-lg px-6">
				<div className="card p-8 mt-16">
					<div className="text-text-soft">Loading...</div>
				</div>
			</div>
		}>
			<LoginClient />
		</Suspense>
	);
}


