import { requireSessionUserId } from '@/lib/agent/session';
import { resolveApprovalRequest } from '@/lib/agent/approvals';
import { updatePendingApprovalFromToken } from '@/lib/agent/approvalEdit';
import { getAgentStore } from '@/lib/agent/controlStore';
import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { loadApprovalPageModel } from '@/lib/agent/approvalPageModel';
import { ApprovalPageShell } from '../ApprovalPageShell';

export const dynamic = 'force-dynamic';

async function decide(formData: FormData) {
	'use server';
	const token = String(formData.get('token') ?? '');
	const decision = formData.get('decision') === 'reject' ? 'reject' : 'approve';
	const userId = await requireSessionUserId();
	if (!userId) redirect(`/sign-in?redirect_to=${encodeURIComponent(`/approve/${token}`)}`);
	try {
		await resolveApprovalRequest({ token, userId, decision });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Could not resolve the approval.';
		redirect(`/approve/${token}?error=${encodeURIComponent(message)}`);
	}
	redirect(`/approve/${token}?done=${decision}`);
}

async function saveEdits(formData: FormData) {
	'use server';
	const token = String(formData.get('token') ?? '');
	const userId = await requireSessionUserId();
	if (!userId) redirect(`/sign-in?redirect_to=${encodeURIComponent(`/approve/${token}`)}`);
	const body = String(formData.get('body') ?? '');
	const titleRaw = formData.get('title');
	const ctaRaw = formData.get('cta');
	const publishAtLocalGst = String(formData.get('publishAtLocalGst') ?? '');
	try {
		await updatePendingApprovalFromToken({
			token,
			userId,
			edit: {
				body,
				title: titleRaw != null ? String(titleRaw) : undefined,
				cta: ctaRaw != null ? String(ctaRaw) : undefined,
				publishAtLocalGst: publishAtLocalGst || undefined,
			},
		});
		redirect(`/approve/${token}?saved=1`);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Could not save changes.';
		redirect(`/approve/${token}?error=${encodeURIComponent(message)}`);
	}
}

export default async function ApprovalPage({
	params,
	searchParams,
}: {
	params: Promise<{ token: string }>;
	searchParams: Promise<{ done?: string; error?: string; saved?: string }>;
}) {
	const { token } = await params;
	const query = await searchParams;
	const userId = await requireSessionUserId();
	if (!userId) {
		return (
			<main className="mx-auto max-w-lg px-4 py-8">
				<h1 className="text-2xl font-semibold">Sign in to approve</h1>
				<p className="mt-3 text-text-soft">This approval has to be confirmed by the CCE account that owns the brand.</p>
				<a
					className="mt-6 inline-flex min-h-12 items-center rounded-xl2 bg-primary px-4 text-white"
					href={`/sign-in?redirect_to=${encodeURIComponent(`/approve/${token}`)}`}
				>
					Sign in
				</a>
			</main>
		);
	}
	const request = await getAgentStore().getApprovalRequestByTokenHash(createHash('sha256').update(token).digest('hex'));
	if (!request || request.ownerUserId !== userId) {
		return (
			<main className="mx-auto max-w-lg px-4 py-8">
				<h1 className="text-2xl font-semibold">Approval unavailable</h1>
				<p className="mt-3">This link is not valid for the signed-in account.</p>
			</main>
		);
	}
	const model = await loadApprovalPageModel({ userId, request });
	return (
		<ApprovalPageShell
			model={model}
			query={query}
			decide={decide}
			saveEdits={saveEdits}
			tokenField={{ name: 'token', value: token }}
		/>
	);
}
