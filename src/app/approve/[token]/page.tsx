import { requireSessionUserId } from '@/lib/agent/session';
import { resolveApprovalRequest } from '@/lib/agent/approvals';
import { getAgentStore } from '@/lib/agent/controlStore';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { ApprovalDecisionForm } from './ApprovalDecisionForm';
import { ApprovalStatusBanner } from './ApprovalStatusBanner';

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

export default async function ApprovalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
	const { token } = await params;
	const query = await searchParams;
	const userId = await requireSessionUserId();
	if (!userId) {
		return (
			<main className="mx-auto max-w-lg px-4 py-8">
				<h1 className="text-2xl font-semibold">Sign in to approve</h1>
				<p className="mt-3 text-text-soft">This approval has to be confirmed by the CCE account that owns the brand.</p>
				<a className="mt-6 inline-flex min-h-12 items-center rounded-xl2 bg-primary px-4 text-white" href={`/sign-in?redirect_to=${encodeURIComponent(`/approve/${token}`)}`}>Sign in</a>
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
	const brain = await getIntelligenceStore().getBrandBrainById(userId, request.brandId);
	const preview = request.preview;
	const schedule = request.requestedAction === 'approve_and_schedule';
	const body = String(preview.body ?? preview.excerpt ?? '');
	return (
		<main className="mx-auto max-w-lg px-4 py-6 space-y-4">
			<p className="text-sm text-text-soft">{brain?.identity.name ?? 'Brand'} · {String(preview.channel ?? 'content')}</p>
			<h1 className="text-2xl font-semibold">{request.summary}</h1>
			{query.done || query.error ? (
				<ApprovalStatusBanner done={query.done} error={query.error} schedule={schedule} />
			) : (
				<p className="text-sm text-text-soft">Status: {request.status}</p>
			)}
			{preview.destination ? <p className="text-sm">Destination: {String(preview.destination)}</p> : <p className="text-sm">Destination required before this can be scheduled.</p>}
			<article className="card whitespace-pre-wrap p-4 text-base leading-relaxed">{body}</article>
			<p className="text-sm">{schedule ? `Approve and schedule for ${String(preview.publishAt ?? '')}` : 'Approve this draft only. It will not be scheduled or published.'}</p>
			{request.status === 'PENDING' && !query.done ? (
				<ApprovalDecisionForm action={decide} token={token} schedule={schedule} />
			) : null}
		</main>
	);
}
