import type { ReactNode } from 'react';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';

export function CapabilityCard({
	href,
	title,
	description,
	icon,
	planned = false,
}: {
	href?: string | null;
	title: string;
	description: string;
	icon: ReactNode;
	planned?: boolean;
}) {
	const body = (
		<>
			<span className="flex items-start justify-between gap-3">
				<span aria-hidden="true" className="text-primary">{icon}</span>
				{planned ? <StatusBadge label="Planned" tone="neutral" /> : <span aria-hidden="true" className="text-primary">→</span>}
			</span>
			<span className="mt-4 block text-base font-semibold">{title}</span>
			<span className="mt-1 block text-sm text-text-soft">{description}</span>
		</>
	);
	if (!href || planned) {
		return <div className="card-info min-h-40 opacity-90">{body}</div>;
	}
	return (
		<Link href={href} className="card-nav min-h-40">
			{body}
		</Link>
	);
}
