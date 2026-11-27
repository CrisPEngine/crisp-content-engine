import type { OverviewArticle, OverviewJob, OverviewOpportunity } from '@/lib/content/overview';
import { presentWorkflowNote, workflowStageLabel, workflowStatusLabel } from '@/lib/command/status';

export type InboxFilter = 'approval' | 'attention' | 'progress' | 'completed' | 'all';

export type InboxEvent = { speaker: string; text: string };

export type InboxConversation = {
	id: string;
	title: string;
	href: string;
	filter: Exclude<InboxFilter, 'all'>;
	status: string;
	stage: string;
	workspace: string;
	events: InboxEvent[];
	explanation: string;
};

export function explainInboxRecord(input: { status: string; stage: string; note: string; error: string | null }): string {
	const status = workflowStatusLabel(input.status);
	const stage = workflowStageLabel(input.stage);
	const note = input.note.trim() ? presentWorkflowNote(input.note.trim()) : '';
	const error = input.error && input.error.trim() && input.error !== input.note ? presentWorkflowNote(input.error.trim()) : '';
	const parts = [`This run is ${status} at ${stage}.`];
	if (note) parts.push(note);
	if (error) parts.push(error);
	if (input.status === 'needs_attention') parts.push('A person has to decide before the workflow continues. This explanation does not approve or publish anything.');
	return parts.join(' ');
}

function filterFor(status: string): Exclude<InboxFilter, 'all'> {
	if (status === 'ready_for_approval') return 'approval';
	if (status === 'needs_attention' || status === 'failed') return 'attention';
	if (status === 'completed') return 'completed';
	return 'progress';
}

export function answerFromRecord(question: string, conversation: Pick<InboxConversation, 'explanation' | 'events' | 'status'>): string {
	const ask = question.toLowerCase();
	if (/publish|go live|cms/.test(ask)) {
		return 'Publishing is not available from this conversation. Draft approval, a CMS draft, and a live page are separate actions. Open the record to see which of those is still outstanding.';
	}
	if (/why|stop|issue|finding|what happened|status/.test(ask)) return conversation.explanation;
	if (/next|do next/.test(ask)) return conversation.events.at(-1)?.text ?? conversation.explanation;
	return 'This inbox can explain the recorded status, stage and note. It cannot draft a revision or change the workflow from this message.';
}

export function buildInboxConversations(input: {
	workspace: string;
	jobs: OverviewJob[];
	opportunities: OverviewOpportunity[];
	articles: OverviewArticle[];
}): InboxConversation[] {
	const fromJobs = input.jobs.map((job) => {
		const opportunity = input.opportunities.find((item) => item.id === job.opportunityId);
		const article = input.articles.find((item) => item.id === job.articleId);
		const title = article?.title || opportunity?.title || 'Content workflow';
		const explanation = explainInboxRecord(job);
		const events: InboxEvent[] = [
			{ speaker: 'CRISP', text: `Recorded stage: ${workflowStageLabel(job.stage)}.` },
			{ speaker: 'CRISP', text: explanation },
		];
		if (article) events.push({ speaker: 'CRISP', text: `Article record: ${article.title}. Opening it does not publish it.` });
		return {
			id: job.id,
			title,
			href: job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production',
			filter: filterFor(job.status),
			status: workflowStatusLabel(job.status),
			stage: workflowStageLabel(job.stage),
			workspace: input.workspace,
			events,
			explanation,
		};
	});
	const started = new Set(input.jobs.map((job) => job.opportunityId));
	const waiting = input.opportunities
		.filter((item) => item.status === 'approved' && !started.has(item.id))
		.map((item) => ({
			id: item.id,
			title: item.title,
			href: '/campaigns#approved',
			filter: 'progress' as const,
			status: 'Not started',
			stage: 'Opportunity',
			workspace: input.workspace,
			explanation: 'This opportunity is approved and has not started. A paused campaign does not start it.',
			events: [
				{ speaker: 'CRISP', text: 'This opportunity is approved and has not started.' },
				{ speaker: 'CRISP', text: 'A paused campaign does not start new production.' },
			],
		}));
	return [...fromJobs, ...waiting];
}
