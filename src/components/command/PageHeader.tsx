export function PageHeader({
	eyebrow,
	title,
	description,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
}) {
	return (
		<header className="space-y-2">
			{eyebrow ? <p className="text-sm font-medium text-text-soft">{eyebrow}</p> : null}
			<h1 className="text-[1.75rem] font-semibold leading-tight md:text-[2rem]">{title}</h1>
			{description ? <p className="max-w-3xl text-base text-text-soft">{description}</p> : null}
		</header>
	);
}
