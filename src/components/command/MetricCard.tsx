import Link from 'next/link';

export function MetricCard({
	href,
	title,
	value,
	detail,
	icon,
}: {
	href: string;
	title: string;
	value: string | number;
	detail: string;
	icon: string;
}) {
	return (
		<Link href={href} className="card-nav min-h-36">
			<span className="flex items-start justify-between gap-3">
				<span aria-hidden="true" className="text-lg">{icon}</span>
				<span aria-hidden="true" className="text-primary">→</span>
			</span>
			<span className="mt-3 block text-[1.75rem] font-semibold leading-none">{value}</span>
			<span className="mt-2 block text-base font-medium">{title}</span>
			<span className="mt-1 block text-sm text-text-soft">{detail}</span>
		</Link>
	);
}
