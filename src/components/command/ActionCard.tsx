import Link from 'next/link';
import { StatusBadge, toneForStatus } from './StatusBadge';

export function ActionCard({
	title,
	detail,
	status,
	href,
	action,
}: {
	title: string;
	detail: string;
	status: string;
	href: string;
	action: string;
}) {
	return (
		<article className="card-action flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0">
				<h3 className="text-base font-semibold">{title}</h3>
				<p className="mt-1 text-sm text-text-soft">{detail}</p>
				<div className="mt-2">
					<StatusBadge label={status} tone={toneForStatus(status)} />
				</div>
			</div>
			<Link href={href} className="btn-primary shrink-0">{action} →</Link>
		</article>
	);
}
