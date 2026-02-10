'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search, X } from 'lucide-react';

import type { DocsNavSection, DocsSearchItem } from '@/lib/docs/types';

function normalize(q: string) {
	return q.trim().toLowerCase();
}

export function DocsHeader({
	nav,
	searchIndex,
}: {
	nav: DocsNavSection[];
	searchIndex: DocsSearchItem[];
}) {
	const router = useRouter();
	const pathname = usePathname();
	const [q, setQ] = useState('');
	const [mobileOpen, setMobileOpen] = useState(false);

	const results = useMemo(() => {
		const query = normalize(q);
		if (!query) return [];
		const tokens = query.split(/\s+/).filter(Boolean);
		return searchIndex
			.map((item) => {
				const hay = `${item.title} ${item.description} ${item.section} ${item.keywords || ''}`.toLowerCase();
				const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
				return { item, score };
			})
			.filter((r) => r.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 8)
			.map((r) => r.item);
	}, [q, searchIndex]);

	return (
		<div className="sticky top-[90px] z-20 border-b border-edge/60 bg-bg/80 backdrop-blur-xs">
			<div className="flex items-center gap-3 py-3">
				<button
					type="button"
					onClick={() => setMobileOpen(true)}
					className="inline-flex items-center justify-center rounded-md border border-edge/60 bg-surface/30 p-2 text-text-soft hover:bg-surface/50 lg:hidden"
					aria-label="Open docs navigation"
				>
					<Menu className="h-4 w-4" />
				</button>

				<Link href="/docs" className="text-sm font-semibold text-text hover:text-text-soft transition">
					Docs
				</Link>

				<div className="relative ml-auto w-full max-w-lg">
					<div className="flex items-center gap-2 rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 text-text-soft">
						<Search className="h-4 w-4 text-text-dim" />
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="Search docs…"
							className="w-full bg-transparent text-sm outline-none placeholder:text-text-dim"
							aria-label="Search docs"
						/>
						{q && (
							<button
								type="button"
								onClick={() => setQ('')}
								className="rounded-md p-1 hover:bg-surface/50"
								aria-label="Clear search"
							>
								<X className="h-4 w-4" />
							</button>
						)}
					</div>

					{q && results.length > 0 && (
						<div className="absolute left-0 right-0 mt-2 overflow-hidden rounded-xl2 border border-edge/60 bg-surface/95 shadow-soft">
							<div className="max-h-[360px] overflow-auto">
								{results.map((r) => (
									<button
										key={r.href}
										type="button"
										onClick={() => {
											setQ('');
											router.push(r.href);
										}}
										className="w-full px-4 py-3 text-left hover:bg-surface/60"
									>
										<div className="text-xs font-semibold text-text-dim">{r.section}</div>
										<div className="text-sm font-semibold text-text">{r.title}</div>
										<div className="mt-0.5 text-xs text-text-soft line-clamp-2">{r.description}</div>
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<Link
					href={pathname.startsWith('/docs') ? '/dashboard' : '/docs'}
					className="hidden sm:inline-flex items-center rounded-md border border-edge/60 bg-surface/30 px-3 py-2 text-xs font-semibold text-text-soft hover:bg-surface/50"
				>
					Go to app
				</Link>
			</div>

			{/* Mobile nav overlay */}
			{mobileOpen && (
				<div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
					<div
						className="absolute inset-0 bg-black/60"
						onClick={() => setMobileOpen(false)}
					/>
					<div className="absolute left-0 top-0 h-full w-[86vw] max-w-sm overflow-auto bg-bg border-r border-edge/60 p-4">
						<div className="flex items-center justify-between">
							<Link href="/docs" className="text-sm font-semibold text-text" onClick={() => setMobileOpen(false)}>
								Docs
							</Link>
							<button
								type="button"
								onClick={() => setMobileOpen(false)}
								className="inline-flex items-center justify-center rounded-md border border-edge/60 bg-surface/30 p-2 text-text-soft hover:bg-surface/50"
								aria-label="Close docs navigation"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<div className="mt-4 space-y-6">
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
														onClick={() => setMobileOpen(false)}
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
					</div>
				</div>
			)}
		</div>
	);
}

