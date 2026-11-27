import { describe, expect, it } from 'vitest';
import { answerFromRecord, buildInboxConversations, explainInboxRecord } from '@/lib/command/inboxModel';
import { workflowNodesForRun } from '@/lib/command/workflowGraph';

const job = {
	id: 'job-1',
	opportunityId: 'opp-1',
	articleId: 'article-1',
	stage: 'corrections',
	status: 'needs_attention',
	note: '2 recommendations still need a decision.',
	error: null,
};

describe('workflow and inbox records', () => {
	it('marks the recorded stage as current and does not call earlier stages successful events', () => {
		const nodes = workflowNodesForRun(job, { id: 'article-1', title: 'Chapter', status: 'draft', cmsState: null });
		expect(nodes.find((node) => node.id === 'corrections')?.label).toBe('Needs attention');
		expect(nodes.find((node) => node.id === 'research')?.label).toBe('Historical stage');
		expect(nodes.find((node) => node.id === 'approval')?.label).toBe('Not reached');
		expect(nodes.find((node) => node.id === 'publish')?.label).toBe('Not published');
	});

	it('explains a stop from the recorded note and refuses a publish request', () => {
		const conversations = buildInboxConversations({
			workspace: 'Folian',
			jobs: [job],
			opportunities: [{ id: 'opp-1', title: 'Chapter opportunity', status: 'approved', recommendedAction: 'create' }],
			articles: [{ id: 'article-1', title: 'How to decide the next chapter', status: 'draft' }],
		});
		expect(conversations).toHaveLength(1);
		expect(conversations[0]?.explanation).toContain('Needs attention');
		expect(answerFromRecord('publish this', conversations[0]!)).toContain('not available from this conversation');
		expect(explainInboxRecord(job)).toContain('does not approve or publish');
	});
});
