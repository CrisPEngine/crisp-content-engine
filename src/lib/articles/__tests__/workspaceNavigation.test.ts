import { describe, expect, it } from 'vitest';
import { findingGroup, isWorkspaceStage, passageAnchor, stageTone, workspaceStageFromLocation } from '@/lib/articles/workspaceNavigation';

const flags = {
	briefApproved: true,
	briefNeedsReapproval: false,
	researchApproved: true,
	researchChanged: true,
	hasDraft: true,
	reviewCurrent: false,
	reviewBlocked: true,
	imagesReady: false,
	seoReady: true,
	cmsCurrent: false,
};

describe('workspace navigation', () => {
	it('keeps a stored stage and prefers the address when it names one', () => {
		expect(workspaceStageFromLocation('', 'research')).toBe('research');
		expect(workspaceStageFromLocation('?stage=seo', 'research')).toBe('seo');
		expect(workspaceStageFromLocation('?stage=nope', null)).toBe('draft');
		expect(isWorkspaceStage('publish')).toBe(true);
	});

	it('derives stage status from the existing workflow flags', () => {
		expect(stageTone('research', flags)).toBe('attention');
		expect(stageTone('brief', flags)).toBe('complete');
		expect(stageTone('review', flags)).toBe('attention');
		expect(stageTone('images', flags)).toBe('pending');
	});

	it('groups findings and highlights only a passage that exists in the article', () => {
		expect(findingGroup('critical')).toBe('Blocking');
		expect(findingGroup('minor')).toBe('Suggested improvements');
		const body = '## Build a story bible\n\nMara’s radio can receive messages.';
		expect(passageAnchor(body, { section: 'Missing heading', evidence: ['Mara’s radio can receive messages.'] })).toBe('Mara’s radio can receive messages.');
		expect(passageAnchor(body, { section: 'Build a story bible', evidence: [] })).toBe('Build a story bible');
		expect(passageAnchor(body, { section: 'Not in the draft', evidence: ['A sentence that was never written.'] })).toBeNull();
	});
});
