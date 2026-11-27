'use client';

import Link from 'next/link';
import { APP_NAV, APP_NAV_SECONDARY, isNavHrefActive, type NavItem } from '@/lib/nav';
import { HeaderBrandSwitcher } from '@/components/HeaderBrandSwitcher';
import { NavIcon } from '@/components/command/NavIcon';

function siblingsOf(item: NavItem): string[] {
	if (item.href) return APP_NAV.flatMap((entry) => entry.href ? [entry.href] : []);
	return item.items?.map((sub) => sub.href) ?? [];
}

function itemClass(active: boolean) {
	return `flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-text ring-1 ring-primary/30' : 'text-text-soft hover:bg-surface-hover hover:text-text'}`;
}

export function AppSidebar({
	pathname,
	open,
	collapsed,
	onNavigate,
	onExpand,
}: {
	pathname: string;
	open: boolean;
	collapsed: boolean;
	onNavigate: () => void;
	onExpand: () => void;
}) {
	return (
		<aside className={`${open ? 'flex' : 'hidden'} app-sidebar md:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-edge bg-sidebar md:w-[var(--sidebar-width)]`}>
			<div className="border-b border-edge px-3 py-4">
				<Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-wide" onClick={onNavigate}>
					<NavIcon name="Home" className="h-4 w-4" />
					{collapsed ? <span className="sr-only">CRISP</span> : <span>CRISP</span>}
				</Link>
				{collapsed ? (
					<button type="button" className="mt-3 hidden w-full rounded-lg border border-edge p-2 md:block" onClick={onExpand} title="Show workspace" aria-label="Show workspace">
						<NavIcon name="Campaigns" className="mx-auto h-4 w-4" />
					</button>
				) : (
					<div className="mt-3">
						<p className="text-xs font-medium uppercase tracking-wide text-text-dim">Workspace</p>
						<div className="mt-1">
							<HeaderBrandSwitcher variant="sidebar" />
						</div>
					</div>
				)}
			</div>
			<nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" aria-label="Primary">
				{APP_NAV.map((item) => {
					if (!item.items && item.href) {
						const on = isNavHrefActive(pathname, item.href, siblingsOf(item));
						return (
							<Link key={item.label} href={item.href} onClick={onNavigate} aria-current={on ? 'page' : undefined} title={item.label} className={itemClass(on)}>
								<NavIcon name={item.label} />
								<span className={collapsed ? 'sr-only' : ''}>{item.label}</span>
							</Link>
						);
					}
					const childHrefs = item.items?.map((sub) => sub.href) ?? [];
					const sectionOn = childHrefs.some((href) => isNavHrefActive(pathname, href, childHrefs));
					if (collapsed && item.items?.[0]) {
						return (
							<Link key={item.label} href={item.items[0].href} onClick={onNavigate} aria-current={sectionOn ? 'page' : undefined} title={item.label} className={itemClass(sectionOn)}>
								<NavIcon name={item.label} />
								<span className="sr-only">{item.label}</span>
							</Link>
						);
					}
					return (
						<div key={item.label} className="pt-3">
							<p className={`px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide ${sectionOn ? 'text-primary' : 'text-text-dim'}`}>{item.label}</p>
							{item.items?.map((sub) => {
								const subOn = isNavHrefActive(pathname, sub.href, childHrefs);
								return (
									<Link key={sub.href} href={sub.href} onClick={onNavigate} aria-current={subOn ? 'page' : undefined} title={sub.label} className={itemClass(subOn)}>
										<NavIcon name={sub.label} />
										<span>{sub.label}</span>
									</Link>
								);
							})}
						</div>
					);
				})}
			</nav>
			<nav className="space-y-1 border-t border-edge px-2 py-3" aria-label="Secondary">
				{APP_NAV_SECONDARY.map((item) => (
					<Link key={item.href + item.label} href={item.href} onClick={onNavigate} title={item.label} className={itemClass(false)}>
						<NavIcon name={item.label} />
						<span className={collapsed ? 'sr-only' : ''}>{item.label}</span>
					</Link>
				))}
			</nav>
		</aside>
	);
}
