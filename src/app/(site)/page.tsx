'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginClient } from './login/LoginClient';
import Link from 'next/link';
import { useSupabase } from '@/components/SupabaseProvider';

function HomeContent() {
	const router = useRouter();
	const supabase = useSupabase();

	// Check if user is already authenticated and redirect to dashboard
	useEffect(() => {
		if (!supabase) return;

		const checkSession = async () => {
			try {
				const { data: { session } } = await supabase.auth.getSession();
				if (session) {
					console.log('User already authenticated, redirecting to dashboard');
					router.replace('/dashboard');
				}
			} catch (error) {
				console.error('Error checking session:', error);
			}
		};

		checkSession();
	}, [supabase, router]);

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

export default function Home() {
	return <HomeContent />;
}
