import type { OverviewArticle, OverviewJob } from '@/lib/content/overview';
import { workflowStageLabel, workflowStatusLabel } from '@/lib/command/status';

export type WorkflowNodeKind = 'trigger' | 'agent' | 'tool' | 'approval' | 'output';

export type WorkflowNodeState = {
	id: string;
	name: string;
	kind: WorkflowNodeKind;
	description: string;
	label: string;
	tone: 'complete' | 'current' | 'waiting' | 'idle' | 'failed';
};

const ORDER = ['opportunity', 'research', 'brief', 'draft', 'corrections', 'approval'] as const;

const NODES: Array<Omit<WorkflowNodeState, 'label' | 'tone'>> = [
	{ id: 'opportunity', name: 'Opportunity', kind: 'trigger', description: 'An approved topic can enter this workflow. Starting it is separate from publishing.' },
	{ id: 'research', name: 'Research', kind: 'agent', description: 'Sources and notes are prepared before a draft is written.' },
	{ id: 'brief', name: 'Planning', kind: 'agent', description: 'The brief records what the draft is supposed to cover.' },
	{ id: 'draft', name: 'Content draft', kind: 'agent', description: 'A draft is prepared from the approved brief.' },
	{ id: 'corrections', name: 'Editorial review', kind: 'agent', description: 'Quality checks can stop the run when a person must decide. This is not human approval.' },
	{ id: 'approval', name: 'Human approval', kind: 'approval', description: 'A person approves the draft. Approval does not publish the website.' },
	{ id: 'cms', name: 'CMS draft', kind: 'tool', description: 'Sending a draft to the CMS is a separate step from publication.' },
	{ id: 'publish', name: 'Publication', kind: 'output', description: 'A live page is a separate human action. Autonomous publishing stays off unless the workspace enables it.' },
];

export function stageNodeId(stage: string): (typeof ORDER)[number] | null {
	if (stage === 'metadata') return 'draft';
	return ORDER.includes(stage as (typeof ORDER)[number]) ? stage as (typeof ORDER)[number] : null;
}

function published(article: OverviewArticle | undefined): boolean {
	return article?.cmsState === 'published' || article?.publicationPhase === 'published' || article?.publicationPhase === 'verified_live' || article?.status === 'published';
}

/** Status labels come from the recorded job stage. Earlier stages are marked only as earlier, not as a separate success event. */
export function workflowNodesForRun(job: OverviewJob, article?: OverviewArticle): WorkflowNodeState[] {
	const current = stageNodeId(job.stage);
	const currentIndex = current ? ORDER.indexOf(current) : -1;
	return NODES.map((node) => {
		if (node.id === 'cms') {
			const sent = Boolean(article?.cmsState && article.cmsState !== 'not_sent');
			return { ...node, label: sent ? `CMS: ${article?.cmsState}` : 'Not sent', tone: sent ? 'complete' : 'idle' };
		}
		if (node.id === 'publish') {
			return { ...node, label: published(article) ? 'Published' : 'Not published', tone: published(article) ? 'complete' : 'idle' };
		}
		const index = ORDER.indexOf(node.id as (typeof ORDER)[number]);
		if (currentIndex < 0) return { ...node, label: 'Stage not recorded', tone: 'idle' };
		if (index < currentIndex) return { ...node, label: 'Earlier stage', tone: 'complete' };
		if (index === currentIndex) {
			const label = node.id === 'draft' && job.stage === 'metadata' ? 'Search metadata' : workflowStatusLabel(job.status);
			return { ...node, label, tone: job.status === 'failed' ? 'failed' : job.status === 'completed' ? 'complete' : 'current' };
		}
		return { ...node, label: 'Not reached', tone: 'waiting' };
	});
}

export function workflowStageSummary(job: OverviewJob): string {
	return `${workflowStageLabel(job.stage)} · ${workflowStatusLabel(job.status)}`;
}
