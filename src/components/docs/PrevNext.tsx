import Link from 'next/link';

import type { DocMeta } from '@/lib/docs/types';

export function PrevNext({ prev, next }: { prev?: DocMeta; next?: DocMeta }) {
	if (!prev && !next) return null;

	return (
		<div className="mt-12 grid gap-4 border-t border-edge/60 pt-6 sm:grid-cols-2">
			{prev ? (
				<Link
					href={prev.href}
					className="rounded-xl2 border border-edge/60 bg-surface/30 p-4 hover:bg-surface/50 transition"
				>
					<div className="text-xs font-semibold text-text-dim">Previous</div>
					<div className="mt-1 text-sm font-semibold text-text">{prev.title}</div>
					<div className="mt-1 text-xs text-text-soft line-clamp-2">{prev.description}</div>
				</Link>
			) : (
				<div />
			)}

			{next ? (
				<Link
					href={next.href}
					className="rounded-xl2 border border-edge/60 bg-surface/30 p-4 hover:bg-surface/50 transition sm:text-right"
				>
					<div className="text-xs font-semibold text-text-dim">Next</div>
					<div className="mt-1 text-sm font-semibold text-text">{next.title}</div>
					<div className="mt-1 text-xs text-text-soft line-clamp-2">{next.description}</div>
				</Link>
			) : (
				<div />
			)}
		</div>
	);
}

