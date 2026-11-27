'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSupabase } from './SupabaseProvider';
import { AppSidebar } from '@/components/command/AppSidebar';
import { NavIcon } from '@/components/command/NavIcon';
import { ThemeControl } from '@/components/command/ThemeControl';
import { PanelLeft } from 'lucide-react';

export function AppHeader() {
	const pathname = usePathname();
	const router = useRouter();
	const supabase = useSupabase();
	const [user, setUser] = useState<{ email: string; initials: string } | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [mobileNav, setMobileNav] = useState(false);
	const [collapsed, setCollapsed] = useState(false);

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
		const stored = localStorage.getItem('crisp-sidebar') === 'collapsed';
		setCollapsed(stored);
		document.documentElement.dataset.sidebar = stored ? 'collapsed' : 'expanded';
	}, []);

	useEffect(() => {
		setMobileNav(false);
		setMenuOpen(false);
	}, [pathname]);

	if (pathname === '/sign-in' || pathname === '/login' || pathname === '/') return null;

	function setSidebar(next: boolean) {
		setCollapsed(next);
		document.documentElement.dataset.sidebar = next ? 'collapsed' : 'expanded';
		localStorage.setItem('crisp-sidebar', next ? 'collapsed' : 'expanded');
	}

	const pageLabel = pathname.startsWith('/dashboard') ? 'Home'
		: pathname.startsWith('/inbox') ? 'Inbox'
		: pathname.startsWith('/workflows') ? 'Workflows'
		: pathname.startsWith('/agents') ? 'Agents'
		: pathname.startsWith('/intelligence') ? 'Intelligence'
		: pathname.startsWith('/content/articles/') ? 'Article'
		: pathname.startsWith('/content') ? 'Content'
		: pathname.startsWith('/campaigns') ? 'Campaigns'
		: pathname.startsWith('/connections') ? 'Integrations'
		: 'CRISP Command';

	const signOut = async () => {
		if (!supabase) return;
		await supabase.auth.signOut();
		router.push('/');
	};

	return (
		<>
			{mobileNav ? <button className="fixed inset-0 z-30 bg-black/50 md:hidden" aria-label="Close navigation" onClick={() => setMobileNav(false)} /> : null}
			<Suspense fallback={null}>
				<AppSidebar pathname={pathname} open={mobileNav} collapsed={collapsed && !mobileNav} onNavigate={() => setMobileNav(false)} onExpand={() => setSidebar(false)} />
			</Suspense>
			<header className="app-header fixed top-0 right-0 left-0 z-20 flex h-14 items-center gap-2 border-b border-edge bg-sidebar px-4">
				<button type="button" className="inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm font-medium md:hidden" onClick={() => setMobileNav(true)}><PanelLeft className="h-4 w-4" aria-hidden="true" /> Menu</button>
				<button type="button" className="hidden items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover md:inline-flex" aria-pressed={collapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={() => setSidebar(!collapsed)}><PanelLeft className="h-4 w-4" aria-hidden="true" />{collapsed ? 'Expand' : 'Collapse'}</button>
				<p className="truncate text-sm text-text-soft"><span className="text-text-dim">CRISP</span> <span aria-hidden="true">/</span> <span className="text-text">{pageLabel}</span></p>
				<Link href="/inbox" className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-text-soft hover:bg-surface-hover hover:text-text" aria-label="Inbox"><NavIcon name="Inbox" /> <span className="hidden sm:inline">Inbox</span></Link>
				<AccountMenu open={menuOpen} label={user?.initials ?? '…'} onToggle={() => setMenuOpen((open) => !open)} onClose={() => setMenuOpen(false)}>
					<p className="truncate px-2 py-1 text-xs text-text-dim">{user?.email ?? 'Signed in'}</p>
					<p className="px-2 pb-2 text-xs text-text-soft">Workspace is the brand selected in the sidebar.</p>
					<ThemeControl />
					<Link href="/billing" className="block rounded-lg px-2 py-2 text-sm hover:bg-surface-hover" role="menuitem" onClick={() => setMenuOpen(false)}>Settings</Link>
					<Link href="/docs" className="block rounded-lg px-2 py-2 text-sm hover:bg-surface-hover" role="menuitem" onClick={() => setMenuOpen(false)}>Help</Link>
					<button type="button" className="block w-full rounded-lg px-2 py-2 text-left text-sm text-danger hover:bg-surface-hover" role="menuitem" onClick={signOut}>Sign out</button>
				</AccountMenu>
			</header>
		</>
	);
}

function AccountMenu({
	open,
	label,
	onToggle,
	onClose,
	children,
}: {
	open: boolean;
	label: string;
	onToggle: () => void;
	onClose: () => void;
	children: ReactNode;
}) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ top: 56, right: 16 });

	useEffect(() => {
		if (!open) return;
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect) setBox({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose();
		}
		function onPointer(event: MouseEvent) {
			const target = event.target as Node;
			if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
			onClose();
		}
		document.addEventListener('keydown', onKey);
		document.addEventListener('mousedown', onPointer);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('mousedown', onPointer);
		};
	}, [open, onClose]);

	return (
		<>
			<button ref={buttonRef} type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-xs font-semibold" aria-expanded={open} aria-haspopup="menu" aria-label="Account menu" onClick={onToggle}>
				{label}
			</button>
			{open && typeof document !== 'undefined' ? createPortal(
				<div ref={panelRef} role="menu" aria-label="Account" className="fixed z-[80] w-72 rounded-xl border border-edge bg-surface p-2 shadow-soft" style={{ top: box.top, right: box.right }}>
					{children}
				</div>,
				document.body,
			) : null}
		</>
	);
}
