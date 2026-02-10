import Link from 'next/link';

import type { DocHeading } from '@/lib/docs/types';

export function TableOfContents({ headings }: { headings: DocHeading[] }) {
	const items = headings.filter((h) => h.level === 2 || h.level === 3);
	if (items.length === 0) return null;

	return (
		<div className="sticky top-[156px] max-h-[calc(100vh-180px)] overflow-auto">
			<div className="text-[11px] font-semibold tracking-wide text-text-dim uppercase">
				On this page
			</div>
			<ul className="mt-3 space-y-2 text-sm">
				{items.map((h) => (
					<li key={h.id} className={h.level === 3 ? 'pl-3' : ''}>
						<Link
							href={`#${h.id}`}
							className="text-text-soft hover:text-text transition"
						>
							{h.text}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

