'use client';

import { supabaseBrowser } from '@/lib/supabase/client';

export function SignOutButton() {
	const supabase = supabaseBrowser();
	return (
		<button
			className="rounded-md border px-3 py-1 text-sm"
			onClick={async () => {
				await supabase.auth.signOut();
				window.location.href = '/login';
			}}
		>
			Sign out
		</button>
	);
}


