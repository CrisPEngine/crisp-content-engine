'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSupabase } from './SupabaseProvider';
import { AppSidebar } from '@/components/command/AppSidebar';

export function AppHeader() {
	const pathname = usePathname();
	const router = useRouter();
	const supabase = useSupabase();
	const [user, setUser] = useState<{ email: string; initials: string } | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [mobileNav, setMobileNav] = useState(false);

	useEffect(() => {
		if (!supabase) return;
		supabase.auth.getUser().then(({ data: { user } }: { data: { user: { email?: string; user_metadata?: { full_name?: string } } | null } }) => {
			if (!user) return;
			const name = user.user_metadata?.full_name || user.email || '';
			const initials = name.split(/[\s@.]+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2);
			setUser({ email: user.email || '', initials });
		});
	}, [supabase]);

	useEffect(() => {
		setMobileNav(false);
		setMenuOpen(false);
	}, [pathname]);

	if (pathname === '/sign-in' || pathname === '/login' || pathname === '/') return null;

	const signOut = async () => {
		if (!supabase) return;
		await supabase.auth.signOut();
		router.push('/');
	};

	return (
		<>
			{mobileNav ? <button className="fixed inset-0 z-30 bg-black/60 md:hidden" aria-label="Close navigation" onClick={() => setMobileNav(false)} /> : null}
			<AppSidebar pathname={pathname} open={mobileNav} onNavigate={() => setMobileNav(false)} />
			<header className="fixed top-0 right-0 left-0 z-20 flex h-14 items-center justify-between border-b border-edge bg-[#10161d] px-4 md:left-[17rem]">
				<button type="button" className="inline-flex items-center rounded-lg border border-edge px-3 py-2 text-sm font-medium md:hidden" onClick={() => setMobileNav(true)}>Menu</button>
				<p className="hidden text-sm text-text-soft md:block">CRISP Command</p>
				<div className="relative ml-auto">
					<button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-xs font-semibold" aria-expanded={menuOpen} aria-label="Account menu" onClick={() => setMenuOpen((open) => !open)}>
						{user?.initials ?? '…'}
					</button>
					{menuOpen ? (
						<div className="absolute right-0 mt-2 w-56 rounded-xl border border-edge bg-surface p-2 shadow-soft">
							<p className="truncate px-2 py-1 text-xs text-text-dim">{user?.email ?? 'Signed in'}</p>
							<Link href="/billing" className="block rounded-lg px-2 py-2 text-sm hover:bg-white/5" onClick={() => setMenuOpen(false)}>Billing</Link>
							<button type="button" className="block w-full rounded-lg px-2 py-2 text-left text-sm text-danger hover:bg-white/5" onClick={signOut}>Sign out</button>
						</div>
					) : null}
				</div>
			</header>
		</>
	);
}
