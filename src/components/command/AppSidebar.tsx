'use client';

import Link from 'next/link';
import { APP_NAV, APP_NAV_SECONDARY, isNavHrefActive, type NavItem } from '@/lib/nav';
import { HeaderBrandSwitcher } from '@/components/HeaderBrandSwitcher';

const MARK: Record<string, string> = {
	Home: 'H',
	Inbox: 'In',
	Intelligence: 'I',
	Agents: 'A',
	Workflows: 'W',
	Content: 'C',
	Campaigns: 'Ca',
	Integrations: '⊕',
	Settings: 'S',
	Help: '?',
};

function siblingsOf(item: NavItem): string[] {
	if (item.href) return APP_NAV.flatMap((entry) => entry.href ? [entry.href] : []);
	return item.items?.map((sub) => sub.href) ?? [];
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
		<aside className={`${open ? 'flex' : 'hidden'} app-sidebar md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-edge bg-sidebar md:w-[var(--sidebar-width)]`}>
			<div className="border-b border-edge px-3 py-4">
				<div className="flex items-center justify-between gap-2">
					<Link href="/dashboard" className="text-sm font-semibold tracking-wide" onClick={onNavigate} title="CRISP">CRISP</Link>
				</div>
				{collapsed ? (
					<button type="button" className="mt-3 hidden w-full rounded-lg border border-edge px-2 py-2 text-xs md:block" onClick={onExpand} title="Show workspace">Ws</button>
				) : (
					<>
						<p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-dim">Workspace</p>
						<div className="mt-1">
							<HeaderBrandSwitcher variant="sidebar" />
						</div>
					</>
				)}
			</div>
			<nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" aria-label="Primary">
				{APP_NAV.map((item) => {
					if (!item.items && item.href) {
						const on = isNavHrefActive(pathname, item.href, siblingsOf(item));
						return (
							<Link key={item.label} href={item.href} onClick={onNavigate} aria-current={on ? 'page' : undefined} title={item.label} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${on ? 'bg-primary/15 text-text ring-1 ring-primary/50' : 'text-text-soft hover:bg-surface-hover hover:text-text'}`}>
								<span className="w-6 shrink-0 text-center text-xs" aria-hidden>{MARK[item.label] ?? '•'}</span>
								<span className={collapsed ? 'sr-only md:sr-only' : ''}>{item.label}</span>
							</Link>
						);
					}
					const childHrefs = item.items?.map((sub) => sub.href) ?? [];
					const sectionOn = childHrefs.some((href) => isNavHrefActive(pathname, href, childHrefs));
					if (collapsed && item.items?.[0]) {
						return (
							<Link key={item.label} href={item.items[0].href} onClick={onNavigate} aria-current={sectionOn ? 'page' : undefined} title={item.label} className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-sm ${sectionOn ? 'bg-primary/15 text-text ring-1 ring-primary/40' : 'text-text-soft hover:bg-surface-hover hover:text-text'}`}>
								<span className="w-6 text-center text-xs" aria-hidden>{MARK[item.label] ?? item.label.slice(0, 1)}</span>
								<span className="sr-only">{item.label}</span>
							</Link>
						);
					}
					return (
						<div key={item.label} className="pt-2">
							<p className={`px-3 pb-1 text-xs font-semibold uppercase tracking-wide ${sectionOn ? 'text-primary' : 'text-text-dim'} ${collapsed ? 'sr-only' : ''}`}>{item.label}</p>
							{item.items?.map((sub) => {
								const subOn = isNavHrefActive(pathname, sub.href, childHrefs);
								if (collapsed) {
									return (
										<Link key={sub.href} href={sub.href} onClick={onNavigate} aria-current={subOn ? 'page' : undefined} title={sub.label} className={`mt-0.5 flex min-h-10 items-center rounded-lg px-3 py-2 text-sm ${subOn ? 'bg-primary/15 text-text ring-1 ring-primary/50' : 'text-text-soft hover:bg-surface-hover hover:text-text'}`}>
											<span className="w-6 text-center text-xs" aria-hidden>{sub.label.slice(0, 1)}</span>
											<span className="sr-only">{sub.label}</span>
										</Link>
									);
								}
								return (
									<Link key={sub.href} href={sub.href} onClick={onNavigate} aria-current={subOn ? 'page' : undefined} className={`mt-0.5 flex min-h-10 items-center rounded-lg px-3 py-2 text-sm ${subOn ? 'bg-primary/15 text-text ring-1 ring-primary/50' : 'text-text-soft hover:bg-surface-hover hover:text-text'}`}>
										{sub.label}
									</Link>
								);
							})}
						</div>
					);
				})}
			</nav>
			<nav className="space-y-1 border-t border-edge px-2 py-3" aria-label="Secondary">
				{APP_NAV_SECONDARY.map((item) => (
					<Link key={item.href + item.label} href={item.href} onClick={onNavigate} title={item.label} className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-soft hover:bg-surface-hover hover:text-text">
						<span className="w-6 text-center text-xs" aria-hidden>{MARK[item.label] ?? '•'}</span>
						<span className={collapsed ? 'sr-only' : ''}>{item.label}</span>
					</Link>
				))}
			</nav>
		</aside>
	);
}
