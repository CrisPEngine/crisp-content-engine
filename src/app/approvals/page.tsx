import Link from 'next/link';
import { requireSessionUserId } from '@/lib/agent/session';
import { getAgentStore } from '@/lib/agent/controlStore';
import { redirect } from 'next/navigation';
import { formatApprovalInboxMeta, sortPendingApprovals } from '@/lib/agent/approvalInbox';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const pressableLink =
	'touch-manipulation select-none transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

export default async function ApprovalsInboxPage() {
	const userId = await requireSessionUserId();
	if (!userId) redirect('/sign-in?redirect_to=%2Fapprovals');

	const pending = sortPendingApprovals(await getAgentStore().listApprovalRequests(userId, 'PENDING'));
	const intelligence = getIntelligenceStore();
	const brandNames = new Map<string, string>();
	for (const request of pending) {
		if (brandNames.has(request.brandId)) continue;
		const brain = await intelligence.getBrandBrainById(userId, request.brandId);
		brandNames.set(request.brandId, brain?.identity.name ?? 'Brand');
	}

	return (
		<main className="mx-auto max-w-lg space-y-4 px-4 py-6">
			<h1 className="text-2xl font-semibold">Approvals inbox</h1>
			<p className="text-sm text-text-soft">Pending agent approvals for your account, soonest schedule first.</p>
			{pending.length === 0 ? (
				<p className="card p-4 text-sm text-text-soft">Nothing waiting for approval.</p>
			) : (
				<ul className="space-y-3">
					{pending.map((request) => {
						const meta = formatApprovalInboxMeta(request);
						return (
							<li key={request.id}>
								<Link
									href={`/approvals/${request.id}`}
									className={`card flex min-h-12 items-center justify-between gap-3 p-4 hover:bg-surface/40 ${pressableLink}`}
								>
									<div className="min-w-0">
										<p className="truncate font-medium">{request.summary}</p>
										<p className="text-sm text-text-soft">
											{brandNames.get(request.brandId) ?? 'Brand'} · {meta.channel}
											{meta.publishAt ? ` · ${meta.publishAt}` : ''}
										</p>
									</div>
									<ChevronRight className="h-5 w-5 shrink-0 text-text-soft" aria-hidden />
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</main>
	);
}
