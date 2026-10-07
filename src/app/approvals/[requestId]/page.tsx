import { requireSessionUserId } from '@/lib/agent/session';
import { resolveApprovalRequestById } from '@/lib/agent/approvals';
import { getAgentStore } from '@/lib/agent/controlStore';
import { redirect } from 'next/navigation';
import { loadApprovalPageModel } from '@/lib/agent/approvalPageModel';
import { ApprovalPageShell } from '@/app/approve/ApprovalPageShell';

export const dynamic = 'force-dynamic';

async function decide(formData: FormData) {
	'use server';
	const requestId = String(formData.get('requestId') ?? '');
	const decision = formData.get('decision') === 'reject' ? 'reject' : 'approve';
	const userId = await requireSessionUserId();
	if (!userId) redirect(`/sign-in?redirect_to=${encodeURIComponent(`/approvals/${requestId}`)}`);
	try {
		await resolveApprovalRequestById({ requestId, userId, decision });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Could not resolve the approval.';
		redirect(`/approvals/${requestId}?error=${encodeURIComponent(message)}`);
	}
	redirect(`/approvals/${requestId}?done=${decision}`);
}

export default async function ApprovalByIdPage({
	params,
	searchParams,
}: {
	params: Promise<{ requestId: string }>;
	searchParams: Promise<{ done?: string; error?: string }>;
}) {
	const { requestId } = await params;
	const query = await searchParams;
	const userId = await requireSessionUserId();
	if (!userId) {
		return (
			<main className="mx-auto max-w-lg px-4 py-8">
				<h1 className="text-2xl font-semibold">Sign in to approve</h1>
				<p className="mt-3 text-text-soft">This approval has to be confirmed by the CCE account that owns the brand.</p>
				<a
					className="mt-6 inline-flex min-h-12 items-center rounded-xl2 bg-primary px-4 text-white"
					href={`/sign-in?redirect_to=${encodeURIComponent(`/approvals/${requestId}`)}`}
				>
					Sign in
				</a>
			</main>
		);
	}
	const request = await getAgentStore().getApprovalRequest(requestId);
	if (!request || request.ownerUserId !== userId) {
		return (
			<main className="mx-auto max-w-lg px-4 py-8">
				<h1 className="text-2xl font-semibold">Approval unavailable</h1>
				<p className="mt-3">This request is not available for the signed-in account.</p>
			</main>
		);
	}
	const model = await loadApprovalPageModel({ userId, request });
	return (
		<ApprovalPageShell
			model={model}
			query={query}
			decide={decide}
			tokenField={{ name: 'requestId', value: requestId }}
		/>
	);
}
