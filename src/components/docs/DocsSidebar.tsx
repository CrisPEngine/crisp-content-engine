'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { DocsNavSection } from '@/lib/docs/types';

export function DocsSidebar({ nav }: { nav: DocsNavSection[] }) {
	const pathname = usePathname();

	return (
		<nav className="sticky top-[156px] max-h-[calc(100vh-180px)] overflow-auto pr-2">
			<div className="space-y-6">
				{nav.map((section) => (
					<div key={section.title}>
						<div className="mb-2 text-[11px] font-semibold tracking-wide text-text-dim uppercase">
							{section.title}
						</div>
						<ul className="space-y-1">
							{section.items.map((item) => {
								const active = pathname === item.href;
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											className={[
												'block rounded-md px-2 py-1.5 text-sm transition',
												active
													? 'bg-surface/60 text-text'
													: 'text-text-soft hover:bg-surface/40 hover:text-text',
											].join(' ')}
										>
											{item.title}
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</div>
		</nav>
	);
}

