import { ApprovalDecisionForm } from './[token]/ApprovalDecisionForm';
import { ApprovalPublishImagePreview } from './[token]/ApprovalPublishImagePreview';
import { ApprovalStatusBanner } from './[token]/ApprovalStatusBanner';
import { ApprovalDestinationLine } from './[token]/ApprovalDestinationLine';
import { ApprovalInboxNav, ApprovalReviewNextButton } from './[token]/ApprovalInboxNav';
import type { ApprovalPageModel } from '@/lib/agent/approvalPageModel';
import type { ApprovalUiMode } from './[token]/approvalFeedback';

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
	const {
		request,
		brandName,
		body,
		schedule,
		threadsReply,
		replyContext,
		publishImagePreview,
		destination,
		inbox,
		publishError,
		publishedPermalink,
	} = model;
	const uiMode: ApprovalUiMode = threadsReply ? 'threads_reply' : schedule ? 'schedule' : 'content';
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
				{brandName} · {String(request.preview.channel ?? (threadsReply ? 'threads reply' : 'content'))}
			</p>
			<h1 className="text-2xl font-semibold">{request.summary}</h1>
			{query.done || query.error ? (
				<ApprovalStatusBanner
					done={query.done}
					error={query.error ?? publishError ?? undefined}
					mode={uiMode}
					publishError={publishError}
				/>
			) : (
				<p className="text-sm text-text-soft">Status: {request.status}</p>
			)}
			{threadsReply ? (
				<section className="card space-y-2 p-4 text-sm">
					<p className="font-medium text-text">Original post</p>
					{replyContext.originalAuthorHandle ? (
						<p className="text-text-soft">@{replyContext.originalAuthorHandle.replace(/^@/, '')}</p>
					) : null}
					{replyContext.originalPostExcerpt ? (
						<p className="whitespace-pre-wrap leading-relaxed">{replyContext.originalPostExcerpt}</p>
					) : (
						<p className="text-text-soft">No excerpt on file.</p>
					)}
					{replyContext.targetUrl ? (
						<a className="text-primary underline" href={replyContext.targetUrl} target="_blank" rel="noreferrer">
							Open on Threads
						</a>
					) : null}
				</section>
			) : null}
			{!threadsReply ? (
				<ApprovalDestinationLine destination={destination} hideWhenScheduledSuccess={hideDestinationWarning} />
			) : null}
			<article className="card whitespace-pre-wrap p-4 text-base leading-relaxed">
				{threadsReply ? <p className="mb-2 text-sm font-medium text-text-soft">Your reply</p> : null}
				{body}
			</article>
			{publishedPermalink ? (
				<p className="text-sm">
					<a className="text-primary underline" href={publishedPermalink} target="_blank" rel="noreferrer">
						View published reply
					</a>
				</p>
			) : null}
			{publishImagePreview ? <ApprovalPublishImagePreview preview={publishImagePreview} /> : null}
			<p className="text-sm">
				{threadsReply
					? 'Approve to post this exact reply via the Threads API. Agents cannot post without your approval.'
					: schedule
						? `Approve and schedule for ${String(request.preview.publishAt ?? '')}`
						: 'Approve this draft only. It will not be scheduled or published.'}
			</p>
			{request.status === 'PENDING' && !query.done ? (
				<ApprovalDecisionForm
					action={decide}
					token={tokenField.value}
					tokenFieldName={tokenField.name === 'requestId' ? 'requestId' : 'token'}
					mode={uiMode}
				/>
			) : null}
			{query.done === 'approve' ? <ApprovalReviewNextButton nextRequestId={inbox.next?.id ?? null} /> : null}
		</main>
	);
}
