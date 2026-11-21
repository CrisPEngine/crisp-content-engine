import { describe, expect, it } from 'vitest';
import { classifyRemoteLifecycle, reconcilePublicationState } from '@/lib/publishing/reconcile';
import { productionCapacity, productionHoldReason } from '@/lib/campaigns/productionPolicy';
import { presentationStyleFor, sentenceCase, validatePresentation } from '@/lib/articles/presentationValidation';
import { planOperationTick } from '@/lib/operations/policy';

describe('publication reconciliation', () => {
	it('records a live Payload article without inventing approval or a publish time', () => {
		const result = reconcilePublicationState({
			approval: 'pending',
			remoteStatus: 'draft',
			revision: 1,
			publicationState: null,
			canonicalUrl: null,
		}, { status: 'published', live: true, revision: 3, canonicalUrl: 'https://folian.app/articles/example', publishedAt: null });
		expect(result.lifecycle).toBe('published');
		expect(result.publicationState).toBe('verified_live');
		expect(result.publishedAt).toBeNull();
		expect(result.flag).toMatch(/Approval/);
		expect(result.remoteChanged).toBe(true);
	});

	it('keeps a deleted or draft remote state without changing the local publication record', () => {
		expect(classifyRemoteLifecycle(null, 404)).toBe('deleted');
		const draft = reconcilePublicationState({
			approval: 'pending', remoteStatus: 'draft', revision: 1, publicationState: null, canonicalUrl: null,
		}, { status: 'draft', revision: 2 });
		expect(draft.lifecycle).toBe('draft');
		expect(draft.publicationState).toBeNull();
		expect(draft.publishedAt).toBeNull();
	});
});

describe('capacity and presentation', () => {
	it('does not let a failed job consume the weekly slot', () => {
		const now = Date.parse('2026-11-21T00:00:00.000Z');
		const usage = productionCapacity([
			{ createdAt: '2026-11-20T00:00:00.000Z', status: 'failed' },
			{ createdAt: '2026-11-20T01:00:00.000Z', status: 'ready_for_approval' },
		], now, 1);
		expect(usage.failed).toBe(1);
		expect(usage.started).toBe(1);
		expect(usage.remaining).toBe(0);
		expect(usage.nextSlotAt).toBe('2026-11-27T01:00:00.000Z');
		expect(productionHoldReason({ paused: true, remaining: 0, concurrent: 0, maxConcurrent: 1, nextSlotAt: usage.nextSlotAt })).toMatch(/paused/);
	});

	it('uses sentence case for Folian and preserves the brand name', () => {
		const style = { titleCase: 'sentence' as const, brandNames: ['Folian', 'Story Bible'], acronyms: ['AI'] };
		expect(sentenceCase('how to continue a fiction scene with AI', style)).toBe('How to continue a fiction scene with AI');
		expect(sentenceCase('How to Continue a Fiction Scene With AI', style)).toBe('How to continue a fiction scene with AI');
		expect(sentenceCase('keep the story bible current', style)).toBe('Keep the Story Bible current');
		const issues = validatePresentation({
			title: 'how to continue a fiction scene',
			seoTitle: 'How to continue a fiction scene with AI',
			metaDescription: 'Continue a scene without contradicting earlier chapters.',
			body: '## Gather the facts\n\nCheck the door.\n\n## Next-session checklist\n\n- Approve the scene.',
			altText: 'A writer reviewing notes.',
			brandName: 'Folian',
		});
		expect(issues.some((issue) => issue.code === 'title-case')).toBe(true);
		expect(issues.some((issue) => issue.code === 'heading-case')).toBe(false);
		const linked = validatePresentation({
			title: 'How to continue a fiction scene with AI',
			seoTitle: 'How to continue a fiction scene with AI',
			metaDescription: 'Continue a scene without contradicting earlier chapters.',
			body: 'Use the Story Bible.\n\nSee [the timeline](https://folian.app/articles/how-to-organize-timelines-in-fiction).\n\n## Next-session checklist\n\n- Approve the scene.',
			altText: 'A writer reviewing notes.',
			brandName: 'Folian',
		});
		expect(linked.some((issue) => issue.code === 'brand-name')).toBe(false);
		const styleWithBrands = presentationStyleFor('Folian', ['canon']);
		expect(sentenceCase('ChatGPT and author voice', styleWithBrands)).toBe('ChatGPT and author voice');
		expect(sentenceCase('What ChatGPT can do for novelists', styleWithBrands)).toBe('What ChatGPT can do for novelists');
		expect(sentenceCase('connect OpenAI to Folian', styleWithBrands)).toBe('Connect OpenAI to Folian');
		expect(sentenceCase('keep the story bible current', styleWithBrands)).toBe('Keep the Story Bible current');
		expect(sentenceCase('this tool is available', styleWithBrands)).toBe('This tool is available');
		const repeated = validatePresentation({
			title: 'ChatGPT for Novel Writing',
			seoTitle: 'ChatGPT for Novel Writing',
			metaDescription: 'Use ChatGPT for ideas, then check the story bible before the next chapter.',
			body: '## Chatgpt\n\nOne.\n\n## Chatgpt\n\nTwo.\n\n## Next step\n\nApprove the scene.',
			brandName: 'Folian',
			terminology: ['canon'],
		});
		expect(repeated.filter((issue) => issue.message.includes('Chatgpt'))).toHaveLength(1);
		expect(repeated.some((issue) => /Chatgpt/.test(issue.message) && /should be “Chatgpt”/.test(issue.message))).toBe(false);
	});

	it('does not start production while paused', () => {
		expect(planOperationTick({
			policy: { mode: 'autonomous_approval', paused: true, autonomousPublishingEnabled: false, allowPublishedUpdates: false, weeklyMaximum: 3, maxConcurrentJobs: 1, maxCostUsdPerArticle: 1, maxCorrectionAttempts: 3, themes: [] },
			leaseHeld: false,
			opportunities: [],
			jobs: [],
		})).toEqual([{ type: 'skip', reason: 'paused' }]);
	});
});
