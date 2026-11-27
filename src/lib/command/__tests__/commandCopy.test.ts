import { describe, expect, it } from 'vitest';
import { findingCodeLabel } from '@/lib/articles/workspaceNavigation';
import { APP_NAV, isNavHrefActive } from '@/lib/nav';
import { activityProcess, presentArticleHeadline, presentWorkflowNote, workflowStageLabel, workflowStatusLabel } from '@/lib/command/status';
import { AGENT_CAPABILITIES } from '@/lib/command/agents';

describe('command copy', () => {
	it('turns technical finding codes into sentences and keeps an unknown code readable', () => {
		expect(findingCodeLabel('intro-weak')).toBe('Introduction needs improvement');
		expect(findingCodeLabel('cta-weak')).toBe('Call to action needs improvement');
		expect(findingCodeLabel('custom_check')).toBe('Custom check');
	});

	it('names workflow states without hiding a failure or an approval', () => {
		expect(workflowStatusLabel('needs_attention')).toBe('Needs attention');
		expect(workflowStatusLabel('ready_for_approval')).toBe('Waiting for approval');
		expect(workflowStageLabel('corrections')).toBe('Editorial');
		expect(activityProcess('Published in the CMS')).toBe('Publication record');
		expect(presentWorkflowNote('Review intro-weak and cta-weak on 921d7a62-6903-4f47-aa59-e9e750fc7c4f.')).toBe('Review a weak introduction and a weak call to action on the article.');
	});

	it('keeps diagnostics under Intelligence and does not invent a live reputation agent', () => {
		const content = APP_NAV.find((item) => item.label === 'Content');
		const intelligence = APP_NAV.find((item) => item.label === 'Intelligence');
		expect(content?.items?.some((item) => item.label === 'Diagnostics')).toBe(false);
		expect(intelligence?.items?.some((item) => item.href === '/intelligence?tab=diagnostics')).toBe(true);
		expect(APP_NAV.some((item) => item.href === '/agents')).toBe(true);
		expect(AGENT_CAPABILITIES.find((item) => item.id === 'reputation')?.status).toBe('planned');
		expect(AGENT_CAPABILITIES.find((item) => item.id === 'reputation')?.href).toBeNull();
	});

	it('selects the most specific navigation item and names the decision a person must make', () => {
		const content = ['/content', '/content/articles', '/content/published'];
		expect(isNavHrefActive('/content/articles/abc', '/content', content)).toBe(false);
		expect(isNavHrefActive('/content/articles/abc', '/content/articles', content)).toBe(true);
		const intelligence = ['/intelligence', '/intelligence?tab=themes', '/intelligence?tab=diagnostics'];
		expect(isNavHrefActive('/intelligence', '/intelligence', intelligence, 'tab=themes')).toBe(false);
		expect(isNavHrefActive('/intelligence', '/intelligence?tab=themes', intelligence, 'tab=themes')).toBe(true);
		expect(isNavHrefActive('/intelligence', '/intelligence?tab=diagnostics', intelligence, 'tab=themes')).toBe(false);
		expect(presentArticleHeadline({ needsAttention: true, decisionCount: 2, approval: 'pending', published: false })).toEqual({
			label: 'Human review required',
			detail: '2 editorial recommendations need a decision.',
		});
	});
});
