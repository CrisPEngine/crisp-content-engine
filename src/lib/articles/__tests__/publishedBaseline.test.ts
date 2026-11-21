import { describe, expect, it } from 'vitest';
import { articleLifecycle } from '@/lib/articles/meta';
import { contentApprovalLocksDraft, draftNextAction, editorialAwaitingApplication, improvementJourney, payloadDocumentToMarkdown, preparePublishedImport } from '@/lib/articles/publishedBaseline';
import { commitRevision } from '@/lib/articles/revisions';
import type { ArticleRecord } from '@/lib/articles/types';
import { metadataApplyDecision } from '@/lib/publishing/payloadCatalogue';

function shell(overrides: Record<string, unknown> = {}): ArticleRecord {
	return {
		id: 'd7e76c06-174b-4416-9f74-3cd1699c60c0',
		title: 'Folian vs ChatGPT for Writing a Novel',
		slug: 'folian-vs-chatgpt',
		body: '',
		wordCount: 0,
		status: 'published',
		approval: { status: 'approved', approver: 'human', required: true },
		versions: [],
		sections: [],
		workspace: {
			briefApprovedAt: '2026-11-18T00:00:00.000Z',
			approvedRevisionId: null,
			research: { status: 'approved', approved: { version: 1 } },
			cms: { externalId: 'catalog:folian-vs-chatgpt', revision: null, draftUrl: null, lastSyncAt: '2026-11-17T18:24:54.042Z', lastError: null, mode: null, submittedRevisionId: null },
			revision: null,
		},
		library: {
			archivedAt: null,
			canonicalUrl: 'https://folian.app/articles/folian-vs-chatgpt',
			stageNote: 'Imported from Payload. The published page was not changed.',
			cms: {
				payloadId: '3',
				externalId: 'catalog:folian-vs-chatgpt',
				slug: 'folian-vs-chatgpt',
				title: 'Folian vs ChatGPT for Writing a Novel',
				description: 'Compare ChatGPT and Folian for long-form fiction.',
				status: 'published',
				publishedAt: '2026-10-27T19:14:53.212Z',
				updatedAt: '2026-10-27T19:14:53.213Z',
				hero: null,
				revision: 1,
				contentRef: 'payload:3',
				syncedAt: '2026-11-17T18:24:54.042Z',
			},
		},
		...overrides,
	} as unknown as ArticleRecord;
}

describe('published articles without a local draft', () => {
	it('asks for an import when the local body is empty and a CMS page is connected', () => {
		const next = draftNextAction(shell());
		expect(next.kind).toBe('import');
		expect(next.available).toBe(true);
		expect(next.label).toBe('Import published article');
		expect(next.detail).toMatch(/not yet imported/i);
		expect(articleLifecycle(shell()).submittedToCms).toBe(false);
		expect(articleLifecycle(shell()).approved).toBe(false);
	});

	it('keeps the remote article structure, links and CMS identity as a baseline revision', () => {
		const record = shell();
		const markdown = payloadDocumentToMarkdown({
			layout: [
				{
					blockType: 'richText',
					content: {
						root: {
							children: [
								{ type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'What ChatGPT is good at for writers' }] },
								{ type: 'paragraph', children: [
									{ type: 'text', text: 'See ' },
									{ type: 'link', fields: { url: '/help/bring-your-own-ai-keys' }, children: [{ type: 'text', text: 'how to connect Folian to ChatGPT or Claude' }] },
									{ type: 'text', text: '.' },
								] },
								{ type: 'list', listType: 'bullet', children: [{ type: 'listitem', children: [{ type: 'text', text: 'Keep the story bible' }] }] },
							],
						},
					},
				},
				{ blockType: 'faq', items: [{ question: 'Is Folian a replacement for ChatGPT?', answer: 'Folian is a writing OS, not a replacement.' }] },
			],
		});
		expect(markdown).toContain('## What ChatGPT is good at for writers');
		expect(markdown).toContain('[how to connect Folian to ChatGPT or Claude](/help/bring-your-own-ai-keys)');
		expect(markdown).toContain('- Keep the story bible');
		expect(markdown).toContain('## Is Folian a replacement for ChatGPT?');
		expect(markdown.startsWith('# ')).toBe(false);
		const prepared = preparePublishedImport(record, { markdown, revision: 1, updatedAt: '2026-10-27T19:14:53.213Z', description: 'Compare ChatGPT and Folian for long-form fiction.', payloadId: '3' });
		expect(prepared.imported).toBe(true);
		commitRevision(record, markdown, 'baseline', 'Imported the published article as the local baseline. The live page was not changed.');
		expect(record.id).toBe('d7e76c06-174b-4416-9f74-3cd1699c60c0');
		expect(record.slug).toBe('folian-vs-chatgpt');
		expect(record.library?.cms?.payloadId).toBe('3');
		expect(record.library?.cms?.externalId).toBe('catalog:folian-vs-chatgpt');
		expect(record.workspace?.revision?.source).toBe('baseline');
		expect(record.workspace?.cms.baselineRevision).toBe(1);
		expect(record.approval.status).toBe('approved');
		const next = draftNextAction(record);
		expect(next.kind).toBe('revise');
		expect(next.label).toBe('Generate improved article');
		expect(next.available).toBe(true);
	});

	it('warns when the published page has no content and allows a first draft', () => {
		const record = shell();
		const prepared = preparePublishedImport(record, { markdown: '   ', revision: 1, updatedAt: null, payloadId: '3' });
		expect(prepared.empty).toBe(true);
		expect(record.body).toBe('');
		expect(record.workspace?.cms.remoteBodyState).toBe('empty');
		const next = draftNextAction(record);
		expect(next.kind).toBe('generate');
		expect(next.detail).toMatch(/published page has no content/i);
	});

	it('offers a first draft for an approved brief and research when there is no CMS page', () => {
		const record = shell();
		record.library = undefined;
		record.publication = null;
		record.status = 'draft';
		record.approval = { status: 'pending', approver: 'human', required: true };
		const next = draftNextAction(record);
		expect(next.kind).toBe('generate');
		expect(next.label).toBe('Generate Draft');
	});

	it('does not import over a working revision and does not treat a remote change as publishable', () => {
		const record = shell({ body: 'A working revision.', wordCount: 3 });
		record.workspace!.revision = { id: 'working', number: 2, contentHash: 'abc', wordCount: 3, createdAt: '2026-11-20T00:00:00.000Z', source: 'revision', kind: 'content', note: 'Working' };
		record.workspace!.cms.baselineRevision = 1;
		record.workspace!.cms.sync = { state: 'published', remoteRevision: 2, localRevision: 2, localChangesPending: true, remoteChanged: true, checkedAt: '2026-11-21T00:00:00.000Z', flag: null };
		expect(() => preparePublishedImport(record, { markdown: 'Remote replacement.', revision: 2, updatedAt: null, payloadId: '3' })).toThrow(/working draft already exists/i);
		expect(record.body).toBe('A working revision.');
		expect(record.id).toBe('d7e76c06-174b-4416-9f74-3cd1699c60c0');
		const next = draftNextAction(record);
		expect(next.kind).toBe('blocked');
		expect(next.detail).toMatch(/Payload revision is 2/);
		const decision = metadataApplyDecision({ approved: false, baseUpdatedAt: null, currentUpdatedAt: null, live: false, baseRevision: 1, currentRevision: 2 });
		expect(decision.apply).toBe(false);
	});

	it('does not treat a catalogue approval as a lock on the imported baseline', () => {
		const record = shell({ body: 'The imported page.', wordCount: 3 });
		record.workspace!.revision = { id: 'base', number: 1, contentHash: 'abc', wordCount: 1054, createdAt: '2026-11-20T00:00:00.000Z', source: 'baseline', kind: 'baseline', note: 'Baseline' };
		record.approval = { status: 'approved', approver: 'human', required: true };
		expect(contentApprovalLocksDraft(record)).toBe(false);
		expect(editorialAwaitingApplication(record)).toBe(0);
	});

	it('points editorial work to preview when accepted proposals are waiting on the baseline', () => {
		const record = shell({ body: '## Who is Folian for?\n\nFolian is for novelists.', wordCount: 8 });
		record.workspace!.revision = { id: 'base', number: 1, contentHash: 'abc', wordCount: 1054, createdAt: '2026-11-20T00:00:00.000Z', source: 'baseline', kind: 'baseline', note: 'Baseline' };
		record.workspace!.editorialDesk = {
			proposals: [{
				id: 'proposal-1',
				scope: 'section',
				action: 'Close by restating the practical check.',
				reason: 'Weak close.',
				status: 'accepted',
				sourceRevisionId: 'base',
				section: 'Who is Folian for?',
			}],
		};
		const next = draftNextAction(record);
		expect(next.kind).toBe('revise');
		expect(next.label).toBe('Generate improved article');
		expect(editorialAwaitingApplication(record)).toBe(1);
		expect(improvementJourney(record).label).toBe('Generate improved article');
	});

	it('asks to apply a ready preview on the working revision', () => {
		const record = shell({ body: '## Who is Folian for?\n\nFolian is for novelists.', wordCount: 8, status: 'review' });
		record.approval = { status: 'pending', approver: 'human', required: true };
		record.workspace!.revision = { id: 'work', number: 2, contentHash: 'abc', wordCount: 8, createdAt: '2026-11-21T00:00:00.000Z', source: 'improvement', kind: 'content', note: 'Polish' };
		record.workspace!.editorialDesk = {
			proposals: [{ id: 'p', status: 'accepted', sourceRevisionId: 'work', section: 'Who is Folian for?', action: 'Close the section.', scope: 'section', reason: 'Weak close.' }],
			preview: { baseRevisionId: 'work', proposedBody: 'Updated article.', acceptedIds: ['p'], summary: 'Ready', createdAt: '2026-11-21T00:00:00.000Z', preservedIds: [], wordCountBefore: 8, wordCountAfter: 10 },
		} as typeof record.workspace.editorialDesk;
		const journey = improvementJourney(record);
		expect(journey.action).toBe('apply');
		expect(journey.label).toBe('Apply changes');
		expect(journey.pendingChanges).toBe(1);
	});

	it('asks for a fresh import when only the baseline is behind the remote revision', () => {
		const record = shell({ body: 'The imported page.' });
		record.workspace!.revision = { id: 'base', number: 1, contentHash: 'abc', wordCount: 3, createdAt: '2026-11-20T00:00:00.000Z', source: 'baseline', kind: 'baseline', note: 'Baseline' };
		record.workspace!.cms.baselineRevision = 1;
		record.workspace!.cms.sync = { state: 'published', remoteRevision: 2, localRevision: 1, localChangesPending: false, remoteChanged: true, checkedAt: '2026-11-21T00:00:00.000Z', flag: null };
		const next = draftNextAction(record);
		expect(next.kind).toBe('import');
		expect(next.detail).toMatch(/Remote changes detected/);
	});
});
