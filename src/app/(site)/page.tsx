'use client';

import { LoginClient } from './login/LoginClient';
import Link from 'next/link';

export default function Home() {
  return (
		<div className="mx-auto max-w-lg px-6">
			<LoginClient />
			<div className="mt-8 text-center">
				<Link href="/billing" className="text-text-soft hover:text-text text-sm underline">
					View Plans →
				</Link>
        </div>
    </div>
  );
}
