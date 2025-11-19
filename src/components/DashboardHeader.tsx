'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from './SupabaseProvider';
import Link from 'next/link';

export function DashboardHeader() {
	const supabase = useSupabase();
	const [isLoggedIn, setIsLoggedIn] = useState(false);

	useEffect(() => {
		if (!supabase) return;
		
		const checkAuth = async () => {
			const { data: { user } } = await supabase.auth.getUser();
			setIsLoggedIn(!!user);
		};

		checkAuth();

		// Listen for auth changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
			checkAuth();
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [supabase]);

	if (!isLoggedIn) return null;

	return (
		<header className="sticky top-0 z-30 backdrop-blur-xs bg-bg/60 border-b border-edge/60 min-h-[90px] flex items-center">
			<div className="mx-auto max-w-5xl px-4 sm:px-6 w-full flex items-center justify-between">
				<a href="/" className="flex items-center">
					<img 
						src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png" 
						alt="CrisP Content Engine" 
						className="h-20 w-auto"
					/>
				</a>
				<Link
					href="/dashboard"
					className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm font-medium text-primary transition"
				>
					Dashboard
				</Link>
			</div>
		</header>
	);
}

