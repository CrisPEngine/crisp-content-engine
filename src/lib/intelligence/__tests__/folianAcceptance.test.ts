import { describe, expect, it } from 'vitest';
import { resolveModelForRole } from '@/lib/ai/roles';
import { dispatchIntelligenceAction, setIntelligenceAiForTests, setIntelligenceStoreForTests } from '../actions';
import { retrieveRelevantMemory } from '../contentMemory';
import { createMemoryIntelligenceStore } from '../memoryStore';
import { runContentIntelligencePipeline, type IntelligenceAi } from '../pipeline';
import {
	FOLIAN_BRAND_ID,
	FOLIAN_USER_ID,
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from './folianFixture';

function folianAi(draft: string): IntelligenceAi {
	return {
		async completeJson<T>(role: 'WRITING' | 'REVIEW' | 'STRATEGY') {
			if (role === 'REVIEW') {
				return { improvedDraft: draft } as T;
			}
			return {
				draft,
				hook: 'Most writing tools forget the book.',
				argument: 'Canon has to persist with author approval or continuity collapses.',
				cta: 'Look at how story memory keeps canon from drifting.',
				topic: 'AI and authorship',
			} as T;
		},
	};
}

describe('Folian-style intelligence acceptance', () => {
	it('runs intent → retrieval → brief → draft → review → memory with central model roles', async () => {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);

		const brain = await store.upsertBrandBrain(FOLIAN_USER_ID, FOLIAN_BRAND_ID, {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		await store.addExample(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			kind: 'good',
			channel: 'linkedin',
			contentType: 'founder_post',
			body: 'Folian is not a ghostwriter. It is the memory layer that keeps canon from drifting between sessions.',
			whyItWorks: 'Specific product claim, no hype.',
		});
		await store.addExample(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			kind: 'poor',
			channel: 'linkedin',
			body: "In today's fast-paced world, unlock your storytelling potential.",
		});

		const strategy = await store.upsertStrategy(FOLIAN_USER_ID, {
			userId: FOLIAN_USER_ID,
			brandBrainId: brain.id,
			airtableBrandId: FOLIAN_BRAND_ID,
			status: 'active',
			objectives: ['Become the default story-memory layer for serious novelists'],
			audiences: [{ name: 'Serious fiction authors', problems: ['Lost canon'], desiredOutcomes: ['Finish the book'] }],
			audienceProblems: ['Chat tools invent facts', 'Continuity dies between sessions'],
			desiredOutcomes: ['Trusted canon', 'Fewer continuity rewrites'],
			positioning: folianIdentity.positioning,
			keyMessages: ['Memory is the product', 'Authors approve canon', 'Not a ghostwriter'],
			proofPoints: ['Approval before facts persist'],
			contentPillars: ['AI and authorship', 'Continuity craft', 'Author authority'],
			funnelStages: ['awareness', 'consideration'],
			ctaStrategy: { default: 'Invite a look at story memory; no hard sell' },
			contentMix: { linkedin: 0.5, blog: 0.3, x: 0.2 },
			editorialThemes: ['AI and authorship'],
		});
		await store.upsertChannelStrategy(FOLIAN_USER_ID, {
			strategyId: strategy.id,
			channel: 'linkedin',
			role: 'Founder authority on authorship and memory',
			cadence: '2-3/week',
			formats: ['founder_post'],
			constraints: ['No growth-hacker tone'],
		});
		await store.upsertCampaign(FOLIAN_USER_ID, {
			strategyId: strategy.id,
			title: 'Author-memory summer',
			objective: 'authority',
			status: 'active',
		});

		const theme = await store.createTheme(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			strategyId: strategy.id,
			title: 'AI and authorship',
			description: 'Become known for the argument that serious writing needs memory, not autocomplete.',
			objective: 'authority',
			targetAudience: 'Serious fiction authors',
			relatedPillars: ['AI and authorship'],
			keyArguments: ['Canon must persist', 'Authors remain the authority', 'Chatbots invent facts'],
			subtopics: ['canon approval', 'continuity cost', 'why autocomplete fails novels'],
			questionsToAnswer: ['What should an author tool remember?'],
			proofPoints: ['Continuity errors compound across drafts'],
			keywords: ['canon', 'continuity', 'story memory'],
			channels: ['linkedin', 'x', 'blog', 'newsletter'],
			desiredFrequency: '3x/week',
			status: 'active',
		});

		await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			themeId: theme.id,
			strategyId: strategy.id,
			channel: 'linkedin',
			contentType: 'founder_post',
			topic: 'AI and authorship',
			hook: 'Authors do not need another chatbot',
			argument: 'Memory is the product',
			cta: 'See story memory',
			body: 'Authors do not need another chatbot. They need a place that remembers canon.',
			publicationStatus: 'published',
			publicationDate: '2026-08-20T09:00:00.000Z',
		});
		await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			channel: 'linkedin',
			topic: 'espresso rituals',
			hook: 'I drink espresso at 6am in Lisbon',
			argument: 'Morning routines',
			body: 'Unrelated lifestyle post about coffee.',
			publicationStatus: 'published',
			publicationDate: '2024-02-01T09:00:00.000Z',
			createdAt: '2024-02-01T09:00:00.000Z',
		});

		await store.saveLearning(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			scope: 'channel',
			channel: 'linkedin',
			observation: 'Problem-led hooks appear to outperform announcement hooks for this brand.',
			metric: 'comments',
			objective: 'authority',
			supportingMemoryIds: [],
			supportingExperimentIds: [],
			confidence: 'moderate',
			validityStatus: 'active',
			createdAt: '2026-08-01T00:00:00.000Z',
			lastValidatedAt: '2026-08-20T00:00:00.000Z',
		});

		const recent = await store.listMemory(FOLIAN_USER_ID, brain.id);
		const retrieved = retrieveRelevantMemory(recent, {
			channel: 'linkedin',
			userIntent: 'Explain why novelists need story memory rather than another writing chatbot',
			topic: 'AI and authorship',
			hook: 'Authors do not need another chatbot',
			themeId: theme.id,
			allowThemeContinuation: true,
		});
		expect(retrieved.related.some((row) => row.hook?.includes('chatbot'))).toBe(true);
		expect(retrieved.related.some((row) => row.topic === 'espresso rituals')).toBe(false);
		expect(retrieved.warnings.some((warning) => /hook/i.test(warning))).toBe(true);

		const draftText = [
			'Most writing tools forget the book.',
			'Folian treats canon as something the author approves, then continuity can compound instead of collapsing.',
			'That is why story memory is the product, not autocomplete.',
			'If you want to see the workflow, look at how story memory keeps canon from drifting.',
		].join('\n\n');

		const ai = folianAi(draftText);
		setIntelligenceAiForTests(ai);

		const result = await runContentIntelligencePipeline(
			store,
			{
				userId: FOLIAN_USER_ID,
				airtableBrandId: FOLIAN_BRAND_ID,
				userIntent: 'Explain why novelists need story memory rather than another writing chatbot',
				channel: 'linkedin',
				contentType: 'founder_post',
				themeId: theme.id,
				optimizationObjective: 'authority',
				allowThemeContinuation: true,
			},
			ai,
		);

		expect(brain.identity.name).toBe('Folian');
		expect(brain.voice.tone).toMatch(/calm/i);
		expect(brain.guardrails.phrasesToAvoid).toContain('delve');
		expect(strategy.objectives.length).toBeGreaterThan(0);
		expect(theme.title).toBe('AI and authorship');
		expect(result.brief.payload.theme).toBe('AI and authorship');
		expect(result.brief.payload.optimizationObjective).toBe('authority');
		expect(result.brief.payload.relatedPreviousContent.length).toBeGreaterThan(0);
		expect(result.brief.payload.differentiationFromRecent.join(' ')).toMatch(/chatbot/i);
		expect(result.brief.payload.prohibitedPhrases).toContain('delve');
		expect(result.aiDraft).toContain('canon');
		expect(result.reviewedDraft.toLowerCase()).not.toContain('delve');
		expect(result.review.brandFit.passed).toBe(true);
		expect(result.score.predictionNote).toMatch(/insufficient history|relative expectation|not a guarantee/i);
		expect(result.memory.themeId).toBe(theme.id);
		expect(result.memory.strategyId).toBe(strategy.id);
		expect(result.memory.hook).toBeTruthy();
		expect(result.modelRole).toBe('WRITING');
		expect(resolveModelForRole('SIDECAR')).not.toBe('gpt-4o-mini');
		expect(resolveModelForRole('FAST')).toBe('gpt-6-luna');

		const plan = await dispatchIntelligenceAction(FOLIAN_USER_ID, 'generate_theme_plan', {
			themeId: theme.id,
			coreIdea: 'Serious authors need memory, not autocomplete',
		});
		expect((plan as { pieces: unknown[] }).pieces.length).toBeGreaterThan(3);

		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
	});
});
