import { describe, expect, it } from 'vitest';
import { acceptanceLabel, editorialProgress, proposalDisposition, publicationChanges, reviewPrimary } from '@/lib/articles/reviewWorkflow';
import { overlapFindings } from '@/lib/articles/quality';
import { samePublishedPage } from '@/lib/articles/reviewContext';
import type { ArticleRecord } from '@/lib/articles/types';

describe('review workflow', () => {
	const base = { hasCritique: true, reviewStale: false, accepted: 0, hasPreview: false, justApplied: false, blockingOpen: 2 };

	it('keeps acceptance separate from application', () => {
		expect(acceptanceLabel('accepted')).toBe('Approved, awaiting application');
		expect(acceptanceLabel('applied')).toBe('Applied to the draft');
		expect(reviewPrimary({ ...base, accepted: 4 }).label).toBe('Preview 4 Approved Changes');
		expect(reviewPrimary({ ...base, accepted: 1 }).label).toBe('Preview 1 Approved Change');
		expect(reviewPrimary({ ...base, hasCritique: false, accepted: 2 }).action).toBe('preview');
		expect(reviewPrimary({ ...base, accepted: 4, hasPreview: true }).action).toBe('apply');
		expect(reviewPrimary({ ...base, accepted: 4, hasPreview: true }).label).toBe('Confirm new revision');
	});

	it('does not treat acceptance as a completed review or a catalogue copy as a second article', () => {
		const body = '## How Folian fits\n\nUse the story bible.';
		expect(proposalDisposition({ status: 'accepted', sourceRevisionId: 'old', section: 'Checks', action: 'Close the memo.' }, 'current', body)).toBe('conflict');
		expect(proposalDisposition({ status: 'accepted', sourceRevisionId: 'current', action: 'The draft is short. That is acceptable if every question is answered. Do not add filler.' }, 'current', body)).toBe('manual');
		expect(proposalDisposition({ status: 'accepted', sourceRevisionId: 'current', section: 'How Folian fits', action: 'Keep the practical test.' }, 'current', body)).toBe('apply');
		const waiting = editorialProgress({
			proposals: [{ status: 'accepted', sourceRevisionId: 'current', section: 'How Folian fits', action: 'Keep the practical test.' }],
			currentRevisionId: 'current',
			body,
			critiqueRevisionId: 'old',
			openCritical: [{ code: 'content_overlap', evidence: ['Title and keyword overlap with “ChatGPT for Novel Writing”: 100%.'], explanation: 'Same page.' }],
			title: 'ChatGPT for Novel Writing',
			structureOk: true,
		});
		expect(waiting.complete).toBe(false);
		expect(waiting.awaitingApplication).toBe(1);
		expect(waiting.blocker).toMatch(/not in the draft/);
		const done = editorialProgress({
			proposals: [{ status: 'applied', sourceRevisionId: 'current', action: 'Applied.' }],
			currentRevisionId: 'current',
			body,
			critiqueRevisionId: 'current',
			openCritical: [],
			title: 'ChatGPT for Novel Writing',
			structureOk: true,
		});
		expect(done.complete).toBe(true);
		expect(publicationChanges({ metadataStatus: 'pending', currentSeoTitle: 'ChatGPT for Novel Writing', proposedSeoTitle: 'ChatGPT for Novel Writing: Uses & Limits | Folian', currentDescription: 'Published.', proposedDescription: 'Proposed.', baselineRevision: 2 }).kind).toBe('metadata');
		expect(publicationChanges({ metadataStatus: 'pending', currentSeoTitle: 'A', proposedSeoTitle: 'B', revisionSource: 'improvement', baselineRevision: 2 }).kind).toBe('both');
		expect(overlapFindings({ body, wordCount: 8, title: 'ChatGPT for Novel Writing', related: [{ title: 'ChatGPT for Novel Writing', body: '' }] }).some((finding) => finding.code === 'content_overlap')).toBe(false);
		const article = { id: 'working', slug: 'chatgpt-for-novel-writing', library: { canonicalUrl: 'https://folian.app/articles/chatgpt-for-novel-writing', canonicalArticleId: 'catalogue' } } as ArticleRecord;
		const catalogue = { id: 'catalogue', slug: 'chatgpt-for-novel-writing', library: { canonicalUrl: 'https://folian.app/articles/chatgpt-for-novel-writing', cms: { payloadId: '12' } } } as ArticleRecord;
		expect(samePublishedPage(article, catalogue)).toBe(true);
	});

	it('asks for a new critique when the draft moved on, and shows the draft after apply', () => {
		expect(reviewPrimary({ ...base, reviewStale: true }).label).toBe('Run Editorial Pass of Draft');
		expect(reviewPrimary({ ...base, reviewStale: true, accepted: 4 }).label).toBe('Preview 4 Approved Changes');
		expect(reviewPrimary({ ...base, justApplied: true }).action).toBe('draft');
		expect(reviewPrimary({ ...base, hasCritique: false }).action).toBe('critique');
		expect(reviewPrimary({ ...base, blockingOpen: 0 }).action).toBe('images');
	});
});