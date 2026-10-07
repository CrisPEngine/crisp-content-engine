import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';

const pressableLink =
	'touch-manipulation select-none transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

export function ApprovalInboxNav({
	nextRequestId,
	nextSummary,
	othersWaiting,
	showInboxLink = true,
}: {
	nextRequestId: string | null;
	nextSummary: string | null;
	othersWaiting: number;
	showInboxLink?: boolean;
}) {
	if (!nextRequestId && othersWaiting === 0 && !showInboxLink) return null;

	return (
		<section className="card space-y-3 p-4" aria-label="Pending approvals">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-sm font-medium text-text">Pending approvals</h2>
				{showInboxLink ? (
					<Link
						href="/approvals"
						className={`inline-flex min-h-10 items-center gap-1 rounded-xl2 px-3 text-sm text-primary hover:bg-primary/10 ${pressableLink}`}
					>
						<Inbox className="h-4 w-4" aria-hidden />
						Inbox
					</Link>
				) : null}
			</div>
			{nextRequestId ? (
				<Link
					href={`/approvals/${nextRequestId}`}
					className={`flex min-h-12 items-center justify-between gap-3 rounded-xl2 border border-edge/50 bg-surface/30 px-4 py-3 hover:bg-surface/50 ${pressableLink}`}
				>
					<div className="min-w-0">
						<p className="text-sm font-medium">Next pending approval</p>
						{nextSummary ? <p className="truncate text-sm text-text-soft">{nextSummary}</p> : null}
					</div>
					<ChevronRight className="h-5 w-5 shrink-0 text-text-soft" aria-hidden />
				</Link>
			) : (
				<p className="text-sm text-text-soft">No other pending approvals.</p>
			)}
			{othersWaiting > 0 ? (
				<p className="text-sm text-text-soft">
					{othersWaiting} more waiting ·{' '}
					<Link href="/approvals" className="text-primary underline-offset-2 hover:underline">
						View all
					</Link>
				</p>
			) : null}
		</section>
	);
}

const pressableButton =
	'touch-manipulation select-none transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

export function ApprovalReviewNextButton({ nextRequestId }: { nextRequestId: string | null }) {
	if (!nextRequestId) return null;
	return (
		<Link
			href={`/approvals/${nextRequestId}`}
			className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl2 bg-primary px-4 text-white hover:bg-primary/90 active:bg-primary/80 ${pressableButton}`}
		>
			Review next
		</Link>
	);
}
