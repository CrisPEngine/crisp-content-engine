import { requireSessionUserId } from '@/lib/agent/session';
import { resolveApprovalRequest } from '@/lib/agent/approvals';
import { getAgentStore } from '@/lib/agent/controlStore';
import { createHash } from 'crypto';
import { redirect } from 'next/navigation';

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
			<main className="mx-auto max-w-xl p-8">
				<h1 className="text-2xl font-semibold">Sign in to approve</h1>
				<p className="mt-3">This approval has to be confirmed by the CCE account that owns the brand.</p>
				<a className="mt-4 inline-block underline" href={`/sign-in?redirect_to=${encodeURIComponent(`/approve/${token}`)}`}>Sign in</a>
			</main>
		);
	}
	const request = await getAgentStore().getApprovalRequestByTokenHash(createHash('sha256').update(token).digest('hex'));
	if (!request || request.ownerUserId !== userId) {
		return (
			<main className="mx-auto max-w-xl p-8">
				<h1 className="text-2xl font-semibold">Approval unavailable</h1>
				<p className="mt-3">This link is not valid for the signed-in account.</p>
			</main>
		);
	}
	const preview = request.preview;
	return (
		<main className="mx-auto max-w-xl p-8 space-y-4">
			<h1 className="text-2xl font-semibold">{request.summary}</h1>
			<p>Status: {query.done ? query.done : request.status}</p>
			{query.error ? <p>{query.error}</p> : null}
			<p>Action: {request.requestedAction === 'approve_and_schedule' ? `Approve and schedule ${String(preview.publishAt ?? '')}` : 'Approve this draft. This does not publish it.'}</p>
			{preview.channel ? <p>Channel: {String(preview.channel)}</p> : null}
			{preview.body ? <pre className="whitespace-pre-wrap text-sm">{String(preview.body)}</pre> : null}
			{preview.excerpt ? <pre className="whitespace-pre-wrap text-sm">{String(preview.excerpt)}</pre> : null}
			{request.status === 'PENDING' && !query.done ? (
				<form action={decide} className="flex gap-3">
					<input type="hidden" name="token" value={token} />
					<button className="rounded bg-primary px-4 py-2 text-white" name="decision" value="approve" type="submit">Approve</button>
					<button className="rounded border px-4 py-2" name="decision" value="reject" type="submit">Reject</button>
				</form>
			) : null}
		</main>
	);
}
