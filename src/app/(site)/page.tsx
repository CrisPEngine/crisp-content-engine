'use client';

import { Suspense } from 'react';
import { LoginClient } from './login/LoginClient';
import Link from 'next/link';

export default function Home() {
  return (
		<div className="mx-auto max-w-lg px-6">
			<Suspense fallback={
				<div className="card p-8 mt-16">
					<div className="text-text-soft">Loading...</div>
				</div>
			}>
				<LoginClient />
			</Suspense>
			<div className="mt-8 text-center">
				<Link href="/billing" className="text-text-soft hover:text-text text-sm underline">
					View Plans →
				</Link>
        </div>
    </div>
  );
}
