'use client';

import { supabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function SignOutLink() {
	const router = useRouter();
	const supabase = supabaseBrowser();

	const handleSignOut = async (e: React.MouseEvent<HTMLAnchorElement>) => {
		e.preventDefault();
		try {
			await supabase.auth.signOut();
			router.push('/login');
			router.refresh();
		} catch (error) {
			console.error('Error signing out:', error);
			// Still redirect even if sign out fails
			router.push('/login');
		}
	};

	return (
		<a
			href="#"
			onClick={handleSignOut}
			className="hover:text-text-soft transition"
		>
			Sign out
		</a>
	);
}
