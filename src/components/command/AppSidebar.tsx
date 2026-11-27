'use client';

import Link from 'next/link';
import { APP_NAV, APP_NAV_SECONDARY, type NavItem } from '@/lib/nav';
import { HeaderBrandSwitcher } from '@/components/HeaderBrandSwitcher';

function active(pathname: string, href: string) {
	if (href === '/dashboard') return pathname === '/dashboard';
	const path = href.split('?')[0]?.split('#')[0] ?? href;
	return pathname === path || pathname.startsWith(`${path}/`);
}

function itemActive(pathname: string, item: NavItem) {
	if (item.href) return active(pathname, item.href);
	return item.items?.some((sub) => active(pathname, sub.href)) ?? false;
}

export function AppSidebar({
	pathname,
	open,
	onNavigate,
}: {
	pathname: string;
	open: boolean;
	onNavigate: () => void;
}) {
	return (
		<aside className={`${open ? 'flex' : 'hidden'} md:flex fixed inset-y-0 left-0 z-40 w-[17rem] flex-col border-r border-edge bg-[#10161d]`}>
			<div className="border-b border-edge px-4 py-4">
				<Link href="/dashboard" className="text-sm font-semibold tracking-wide" onClick={onNavigate}>CRISP</Link>
				<p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-dim">Workspace</p>
				<div className="mt-1">
					<HeaderBrandSwitcher variant="sidebar" />
				</div>
			</div>
			<nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
				{APP_NAV.map((item) => {
					const on = itemActive(pathname, item);
					if (!item.items) {
						return (
							<Link key={item.label} href={item.href!} onClick={onNavigate} aria-current={on ? 'page' : undefined} className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium ${on ? 'bg-primary/15 text-text ring-1 ring-primary/50' : 'text-text-soft hover:bg-white/5 hover:text-text'}`}>
								{item.label}
							</Link>
						);
					}
					return (
						<div key={item.label} className="pt-2">
							<p className={`px-3 pb-1 text-xs font-semibold uppercase tracking-wide ${on ? 'text-primary' : 'text-text-dim'}`}>{item.label}</p>
							{item.items.map((sub) => {
								const subOn = active(pathname, sub.href);
								return (
									<Link key={sub.href} href={sub.href} onClick={onNavigate} aria-current={subOn ? 'page' : undefined} className={`mt-0.5 flex rounded-lg px-3 py-2 text-sm ${subOn ? 'bg-primary/15 text-text ring-1 ring-primary/50' : 'text-text-soft hover:bg-white/5 hover:text-text'}`}>
										{sub.label}
									</Link>
								);
							})}
						</div>
					);
				})}
			</nav>
			<nav className="space-y-1 border-t border-edge px-3 py-3" aria-label="Secondary">
				{APP_NAV_SECONDARY.map((item) => (
					<Link key={item.href + item.label} href={item.href} onClick={onNavigate} className="flex rounded-lg px-3 py-2 text-sm text-text-soft hover:bg-white/5 hover:text-text">
						{item.label}
					</Link>
				))}
			</nav>
		</aside>
	);
}
