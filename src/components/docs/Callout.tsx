import { Info, Lightbulb, AlertTriangle } from 'lucide-react';

type CalloutType = 'note' | 'tip' | 'warning';

const styles: Record<
	CalloutType,
	{
		wrap: string;
		icon: React.ReactNode;
		label: string;
	}
> = {
	note: {
		wrap: 'border-primary/30 bg-primary/5 text-text-soft',
		icon: <Info className="h-4 w-4 text-primary" />,
		label: 'Note',
	},
	tip: {
		wrap: 'border-accent/30 bg-accent/5 text-text-soft',
		icon: <Lightbulb className="h-4 w-4 text-accent" />,
		label: 'Tip',
	},
	warning: {
		wrap: 'border-warning/30 bg-warning/5 text-text-soft',
		icon: <AlertTriangle className="h-4 w-4 text-warning" />,
		label: 'Warning',
	},
};

export function Callout({
	type,
	title,
	children,
}: {
	type: CalloutType;
	title?: string;
	children: React.ReactNode;
}) {
	const s = styles[type];

	return (
		<div className={`my-6 rounded-xl2 border px-4 py-3 ${s.wrap}`}>
			<div className="flex items-center gap-2 text-sm font-semibold text-text">
				{s.icon}
				<span>{title || s.label}</span>
			</div>
			<div className="mt-2 text-sm leading-relaxed text-text-soft">{children}</div>
		</div>
	);
}

