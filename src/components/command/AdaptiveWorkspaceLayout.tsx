import type { ReactNode } from 'react';

export function AdaptiveWorkspaceLayout({
	left,
	right,
	leftOpen,
	rightOpen,
	children,
}: {
	left?: ReactNode;
	right?: ReactNode;
	leftOpen: boolean;
	rightOpen: boolean;
	children: ReactNode;
}) {
	return (
		<div className="workspace-shell min-w-0">
			<div className="workspace-layout" data-left-open={leftOpen} data-right-open={rightOpen}>
				{leftOpen ? <div className="min-w-0 border-edge md:border-r">{left}</div> : null}
				<div className="min-w-0">{children}</div>
				{rightOpen ? <div className="min-w-0 border-edge md:border-l">{right}</div> : null}
			</div>
		</div>
	);
}
