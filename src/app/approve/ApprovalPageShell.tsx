import { ApprovalDecisionForm } from './[token]/ApprovalDecisionForm';
import { ApprovalPublishImagePreview } from './[token]/ApprovalPublishImagePreview';
import { ApprovalStatusBanner } from './[token]/ApprovalStatusBanner';
import { ApprovalDestinationLine } from './[token]/ApprovalDestinationLine';
import { ApprovalInboxNav, ApprovalReviewNextButton } from './[token]/ApprovalInboxNav';
import type { ApprovalPageModel } from '@/lib/agent/approvalPageModel';

type DecideAction = (formData: FormData) => void | Promise<void>;

export function ApprovalPageShell({
	model,
	query,
	decide,
	tokenField,
}: {
	model: ApprovalPageModel;
	query: { done?: string; error?: string };
	decide: DecideAction;
	tokenField: { name: string; value: string };
}) {
	const { request, brandName, body, schedule, publishImagePreview, destination, inbox } = model;
	const approvedScheduleSuccess = query.done === 'approve' && schedule;
	const hideDestinationWarning = approvedScheduleSuccess && destination.ready;

	return (
		<main className="mx-auto max-w-lg space-y-4 px-4 py-6">
			<ApprovalInboxNav
				nextRequestId={inbox.next?.id ?? null}
				nextSummary={inbox.next?.summary ?? null}
				othersWaiting={inbox.othersWaiting}
			/>
			<p className="text-sm text-text-soft">
				{brandName} · {String(request.preview.channel ?? 'content')}
			</p>
			<h1 className="text-2xl font-semibold">{request.summary}</h1>
			{query.done || query.error ? (
				<ApprovalStatusBanner done={query.done} error={query.error} schedule={schedule} />
			) : (
				<p className="text-sm text-text-soft">Status: {request.status}</p>
			)}
			<ApprovalDestinationLine destination={destination} hideWhenScheduledSuccess={hideDestinationWarning} />
			<article className="card whitespace-pre-wrap p-4 text-base leading-relaxed">{body}</article>
			{publishImagePreview ? <ApprovalPublishImagePreview preview={publishImagePreview} /> : null}
			<p className="text-sm">
				{schedule
					? `Approve and schedule for ${String(request.preview.publishAt ?? '')}`
					: 'Approve this draft only. It will not be scheduled or published.'}
			</p>
			{request.status === 'PENDING' && !query.done ? (
				<ApprovalDecisionForm
					action={decide}
					token={tokenField.value}
					tokenFieldName={tokenField.name === 'requestId' ? 'requestId' : 'token'}
					schedule={schedule}
				/>
			) : null}
			{query.done === 'approve' ? <ApprovalReviewNextButton nextRequestId={inbox.next?.id ?? null} /> : null}
		</main>
	);
}
