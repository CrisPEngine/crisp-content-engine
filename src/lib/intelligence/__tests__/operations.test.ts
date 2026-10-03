import { afterEach, describe, expect, it } from 'vitest';
import { dispatchIntelligenceAction, setIntelligenceAiForTests, setIntelligenceStoreForTests } from '../actions';
import {
	assertActionAllowed,
	enforceIntelligenceRateLimit,
	formatTelegramResult,
	IntelligenceAuthError,
	replayIdempotent,
	resetIntelligenceActorStateForTests,
	resolveIntelligenceActor,
	storeIdempotent,
	type IntelligenceActor,
} from '../actors';
import { computeBaseline, compareToBaseline } from '../baselines';
import { runConfigDiagnostics, runModelRoleDiagnostics } from '../diagnostics';
import { snapshotFromManualMetrics } from '../ingestion/metrics';
import { enqueueWorkflowJob, processNextWorkflowJob } from '../jobs';
import { createMemoryIntelligenceStore } from '../memoryStore';
import { publishStoredMemory } from '../publishMemory';
import type { IntelligenceAi } from '../pipeline';
import {
	destinationForChannel,
	publishArticle,
	registerArticlePublisher,
	resetArticlePublishers,
} from '@/lib/publishing';
import { FOLIAN_BRAND_ID, FOLIAN_USER_ID } from './folianFixture';

function stubAi(draft: string): IntelligenceAi {
	return {
		async completeJson<T>(role: 'WRITING' | 'REVIEW' | 'STRATEGY') {
			if (role === 'REVIEW') return { improvedDraft: draft } as T;
			return {
				draft,
				hook: 'Most writing tools forget the book.',
				argument: 'Canon has to persist with author approval.',
				cta: 'Look at story memory.',
				topic: 'AI and authorship',
			} as T;
		},
	};
}

const telegramActor: IntelligenceActor = {
	type: 'telegram',
	actorId: 'tg-1',
	userId: FOLIAN_USER_ID,
	scopes: ['telegram'],
};

describe('production diagnostics', () => {
	it('reports configuration without leaking secret values', () => {
		const previous = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = 'sk-test-should-never-appear';
		const checks = [...runConfigDiagnostics(), ...runModelRoleDiagnostics()];
		const serialised = JSON.stringify(checks);
		expect(serialised).not.toContain('sk-test-should-never-appear');
		expect(checks.some((check) => check.id === 'openai')).toBe(true);
		expect(checks.some((check) => check.id === 'airtable')).toBe(true);
		expect(checks.some((check) => check.id === 'make_strategy')).toBe(true);
		expect(checks.every((check) => check.detail && !/sk-|eyJ/.test(check.detail))).toBe(true);
		if (previous === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = previous;
	});
});

describe('Folian brand + theme campaign + experiments', () => {
	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		resetArticlePublishers();
	});

	it('seeds Folian, executes a multi-channel plan, publishes, compares, and feeds experiment learnings into the next brief', async () => {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const draft = [
			'Most writing tools forget the book.',
			'Folian treats canon as something the author approves.',
			'Look at how story memory keeps continuity from collapsing.',
		].join('\n\n');
		setIntelligenceAiForTests(stubAi(draft));

		const seeded = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'seed_folian_brain', {
			airtableBrandId: FOLIAN_BRAND_ID,
		})) as { validation: { ok: boolean; issues: unknown[] } };
		expect(seeded.validation.ok).toBe(true);

		const validation = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'validate_brand', {
			airtableBrandId: FOLIAN_BRAND_ID,
			folian: true,
		})) as { ok: boolean; score: number };
		expect(validation.ok).toBe(true);
		expect(validation.score).toBeGreaterThan(0.7);

		const theme = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'create_theme', {
			airtableBrandId: FOLIAN_BRAND_ID,
			title: 'AI and authorship',
			objective: 'authority',
			targetAudience: 'Serious fiction authors',
			relatedPillars: ['AI and authorship'],
			keyArguments: ['Canon must persist'],
			subtopics: ['canon approval'],
			channels: ['linkedin', 'blog'],
		})) as { id: string };

		const campaign = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'execute_theme_plan', {
			airtableBrandId: FOLIAN_BRAND_ID,
			themeId: theme.id,
			coreIdea: 'Serious authors need memory, not autocomplete',
			maxPieces: 2,
		})) as {
			plan: { pieces: unknown[] };
			pieces: Array<{
				channel: string;
				generation: {
					brief: { payload: { theme?: string } };
					memory: { id: string; parentMemoryId?: string; channel: string };
				};
			}>;
		};

		expect(campaign.plan.pieces.length).toBeGreaterThan(1);
		expect(campaign.pieces).toHaveLength(2);
		expect(campaign.pieces.map((piece) => piece.channel).sort()).toEqual(['blog', 'linkedin']);
		expect(campaign.pieces[0].generation.brief.payload.theme).toBe('AI and authorship');
		expect(campaign.pieces[1].generation.memory.parentMemoryId).toBe(campaign.pieces[0].generation.memory.id);

		registerArticlePublisher('linkedin', {
			id: 'linkedin',
			async publish() {
				return {
					ok: true,
					destination: 'linkedin',
					externalId: 'urn:li:ugcPost:test-1',
					url: 'https://www.linkedin.com/feed/update/urn:li:ugcPost:test-1',
				};
			},
		});
		registerArticlePublisher('webhook', {
			id: 'webhook',
			async publish() {
				return { ok: true, destination: 'webhook', externalId: 'article-1', url: 'https://example.com/p/1' };
			},
		});

		const linkedinMemory = campaign.pieces.find((piece) => piece.channel === 'linkedin')!.generation.memory;
		const published = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'publish_content', {
			memoryId: linkedinMemory.id,
			immediate: true,
		})) as { memory: { publicationStatus: string; externalPostId?: string }; externalId?: string };
		expect(published.memory.publicationStatus).toBe('published');
		expect(published.externalId).toBe('urn:li:ugcPost:test-1');

		const queued = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'publish_content', {
			memoryId: campaign.pieces.find((piece) => piece.channel === 'blog')!.generation.memory.id,
		})) as { publicationStatus: string; id: string };
		expect(queued.publicationStatus).toBe('scheduled');
		const job = await processNextWorkflowJob(store, {
			publishing: async (item) => {
				const memory = await store.getMemory(item.userId, String(item.referenceId));
				if (!memory) throw new Error('missing memory');
				const result = await publishStoredMemory(store, item.userId, memory);
				return { destination: result.destination, externalId: result.externalId };
			},
		});
		expect(job?.status).toBe('completed');

		await dispatchIntelligenceAction(FOLIAN_USER_ID, 'ingest_performance', {
			airtableBrandId: FOLIAN_BRAND_ID,
			memoryId: linkedinMemory.id,
			channel: 'linkedin',
			impressions: 1000,
			clicks: 10,
			comments: 2,
			reactions: 8,
		});

		const variantDraft = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'draft_content', {
			airtableBrandId: FOLIAN_BRAND_ID,
			userIntent: 'Problem-led hook about lost canon',
			channel: 'linkedin',
			contentType: 'founder_post',
			themeId: theme.id,
		})) as { memory: { id: string } };

		await dispatchIntelligenceAction(FOLIAN_USER_ID, 'ingest_performance', {
			airtableBrandId: FOLIAN_BRAND_ID,
			memoryId: variantDraft.memory.id,
			channel: 'linkedin',
			impressions: 1000,
			clicks: 40,
			comments: 18,
			reactions: 30,
		});

		const comparison = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'compare_performance', {
			airtableBrandId: FOLIAN_BRAND_ID,
			memoryId: variantDraft.memory.id,
			objective: 'engagement',
		})) as { comparison: { relative: string; summary: string } };
		expect(comparison.comparison.summary).toMatch(/observational|insufficient/i);

		const experiment = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'create_experiment', {
			airtableBrandId: FOLIAN_BRAND_ID,
			title: 'Problem-led vs announcement hooks',
			hypothesis: 'Problem-led hooks earn more comments',
			variable: 'hook_style',
			objective: 'engagement',
			minimumSample: 2,
		})) as { id: string; variants: Array<{ id: string; role: string }> };

		const control = experiment.variants.find((row) => row.role === 'control')!;
		const variant = experiment.variants.find((row) => row.role === 'variant')!;
		await dispatchIntelligenceAction(FOLIAN_USER_ID, 'attach_experiment_variant', {
			experimentId: experiment.id,
			variantId: control.id,
			memoryId: linkedinMemory.id,
		});
		await dispatchIntelligenceAction(FOLIAN_USER_ID, 'attach_experiment_variant', {
			experimentId: experiment.id,
			variantId: variant.id,
			memoryId: variantDraft.memory.id,
		});

		const collected = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'collect_experiment_results', {
			experimentId: experiment.id,
		})) as { analysis: { winnerVariantId?: string; learning?: string } };
		expect(collected.analysis.winnerVariantId).toBe(variant.id);
		expect(collected.analysis.learning).toMatch(/hook_style/i);

		const nextDraft = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'draft_content', {
			airtableBrandId: FOLIAN_BRAND_ID,
			userIntent: 'Write the next LinkedIn post on canon approval',
			channel: 'linkedin',
			contentType: 'founder_post',
			themeId: theme.id,
		})) as { brief: { payload: { guardrails: string[] } } };
		expect(nextDraft.brief.payload.guardrails.some((line) => /EXPERIMENT LEARNING/i.test(line))).toBe(true);
		expect(nextDraft.brief.payload.guardrails.join(' ')).toMatch(/observational only/i);
	});
});

describe('baselines and article publishing', () => {
	it('compares a snapshot to an observational baseline without claiming a forecast', () => {
		const snapshots = [80, 90, 100, 110, 120, 200].map((impressions, index) => ({
			id: `s${index}`,
			channel: 'linkedin',
			collectedAt: `2026-08-0${index + 1}T00:00:00.000Z`,
			impressions,
			reach: impressions,
			normalised: {},
		}));
		const baseline = computeBaseline({
			snapshots,
			channel: 'linkedin',
			objective: 'awareness',
		});
		expect(baseline.n).toBe(6);
		expect(baseline.mean).toBeGreaterThan(0);
		const comparison = compareToBaseline({
			snapshot: snapshots[5],
			baseline,
			objective: 'awareness',
		});
		expect(comparison.relative).toBe('above');
		expect(comparison.summary).toMatch(/observational/i);
		expect(comparison.summary).not.toMatch(/will get|guaranteed/i);
	});

	it('routes articles through the generic publisher registry and allowlists webhooks', async () => {
		expect(destinationForChannel('linkedin')).toBe('linkedin');
		expect(destinationForChannel('blog', 'article')).toBe('webhook');

		const previousUrl = process.env.ARTICLE_PUBLISH_WEBHOOK_URL;
		process.env.ARTICLE_PUBLISH_WEBHOOK_URL = 'https://hooks.example.com/allowed';
		const denied = await publishArticle({
			destination: 'webhook',
			userId: FOLIAN_USER_ID,
			document: {
				body: 'Hello',
				metadata: { webhookUrl: 'https://evil.example/steal' },
			},
		});
		expect(denied.ok).toBe(false);
		expect(denied.error).toMatch(/allowlist/i);

		setIntelligenceStoreForTests(createMemoryIntelligenceStore());
		registerArticlePublisher('webhook', {
			id: 'webhook',
			async publish() {
				return { ok: true, destination: 'webhook', externalId: 'ok' };
			},
		});
		const article = (await dispatchIntelligenceAction(FOLIAN_USER_ID, 'publish_article', {
			destination: 'webhook',
			title: 'Canon',
			body: 'Continuity is the product.',
		})) as { ok: boolean; destination: string };
		expect(article.ok).toBe(true);
		expect(article.destination).toBe('webhook');

		if (previousUrl === undefined) delete process.env.ARTICLE_PUBLISH_WEBHOOK_URL;
		else process.env.ARTICLE_PUBLISH_WEBHOOK_URL = previousUrl;
		resetArticlePublishers();
		setIntelligenceStoreForTests(undefined);
	});

	it('builds a manual performance snapshot with derived rates', () => {
		const snapshot = snapshotFromManualMetrics({
			channel: 'linkedin',
			impressions: 100,
			clicks: 5,
			reactions: 10,
			comments: 2,
			shares: 1,
		});
		expect(snapshot.clickThroughRate).toBe(0.05);
		expect(snapshot.engagementRate).toBeCloseTo(0.13);
	});
});

describe('Telegram / MCP action hardening', () => {
	afterEach(() => {
		resetIntelligenceActorStateForTests();
		delete process.env.TELEGRAM_BOT_SECRET;
		delete process.env.TELEGRAM_USER_MAP;
	});

	it('maps Telegram users, allowlists actions, redacts secrets, and replays idempotent calls', async () => {
		process.env.TELEGRAM_BOT_SECRET = 'bot-secret';
		process.env.TELEGRAM_USER_MAP = '99:user-from-map';

		await expect(
			resolveIntelligenceActor(
				new Request('http://localhost/api/intelligence/actions', {
					headers: { 'x-cce-channel': 'telegram', 'x-cce-secret': 'wrong' },
				}),
			),
		).rejects.toMatchObject({ code: 'telegram_secret_invalid' });

		const actor = await resolveIntelligenceActor(
			new Request('http://localhost/api/intelligence/actions', {
				headers: {
					'x-cce-channel': 'telegram',
					'x-cce-secret': 'bot-secret',
					'x-telegram-user-id': '99',
				},
			}),
		);
		expect(actor.userId).toBe('user-from-map');
		expect(actor.type).toBe('telegram');

		expect(() => assertActionAllowed(actor, 'publish_content')).toThrow(IntelligenceAuthError);
		expect(() => assertActionAllowed(actor, 'seed_folian_brain')).toThrow(/Telegram cannot run/);
		expect(() => assertActionAllowed(actor, 'validate_brand')).not.toThrow();

		const telegram = formatTelegramResult('get_brand', {
			name: 'Folian',
			accessToken: 'secret-token',
			apiKey: 'sk-live',
			body: 'x'.repeat(800),
		});
		expect(telegram.text).not.toContain('secret-token');
		expect(telegram.text).not.toContain('sk-live');
		expect(telegram.text.length).toBeLessThan(3501);

		storeIdempotent(telegramActor, 'get_brand', 'k1', { airtableBrandId: FOLIAN_BRAND_ID }, { name: 'Folian' });
		expect(replayIdempotent(telegramActor, 'get_brand', 'k1', { airtableBrandId: FOLIAN_BRAND_ID })).toEqual({
			name: 'Folian',
		});
		expect(() => replayIdempotent(telegramActor, 'get_brand', 'k1', { airtableBrandId: 'other' })).toThrow(
			/Idempotency key reused/,
		);

		for (let i = 0; i < 40; i += 1) {
			enforceIntelligenceRateLimit({ ...telegramActor, actorId: 'rate-1' }, 'get_brand');
		}
		expect(() => enforceIntelligenceRateLimit({ ...telegramActor, actorId: 'rate-1' }, 'get_brand')).toThrow(
			/Rate limit exceeded/,
		);
	});
});

describe('native workflow publish enqueue', () => {
	it('queues a publishing job without touching the Airtable LinkedIn cron path', async () => {
		const store = createMemoryIntelligenceStore();
		const job = await enqueueWorkflowJob(store, FOLIAN_USER_ID, {
			jobType: 'publishing',
			referenceId: 'mem-1',
			payload: { note: 'Native publish job queued' },
		});
		expect(job.status).toBe('queued');
		expect(job.jobType).toBe('publishing');
	});
});
