import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMcpHttp } from '@/lib/agent/mcp';
import { setAgentStoreForTests, createMemoryAgentStore } from '@/lib/agent/controlStore';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceAiForTests, setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import {
	FOLIAN_BRAND_ID,
	FOLIAN_USER_ID,
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from '@/lib/intelligence/__tests__/folianFixture';
import { generateAssetFromProposal, registerImageProviderForTests, setImageUploaderForTests } from '@/lib/media/images';
import { createMemoryNativeContentStore, getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import type { MediaDecision } from '@/lib/media/types';

const SOCIAL = 'Folian keeps canon from drifting between sessions. Authors approve what becomes memory. It is not a ghostwriter.';

const SECTIONS: Record<string, string> = {
	'What autocomplete cannot hold':
		'Autocomplete can finish a sentence and still lose the book. Folian is built around story memory rather than one-shot generation. Continuity is the practical problem. A name, a wound, a promise, and a timeline have to survive from one writing session to the next. A chat window starts again. A novel does not. Canon is the set of facts the author has accepted, and those facts have to be available when the next scene is written. The memory layer exists so the manuscript stays coherent across months of work. Authors review proposed facts before they enter canon. That review is the boundary. The tool may notice a contradiction. It does not get to declare that the contradiction is the new truth. Serious fiction needs that distinction because a long book accumulates details faster than a person can keep them all in working memory.',
	'Canon stays with the author':
		'Authors review proposed facts before they enter canon. The proposal can be useful and still be wrong. Folian keeps the suggestion outside the story until the author accepts it. Continuity errors are cheaper to catch in a memory layer than in draft 12, when a forgotten detail has already spread through later chapters. This is not a claim about sales, speed, or replacing anyone. It is a claim about where facts live. They live with the author, and the product holds them so the next session begins from the book rather than from a blank prompt. The positioning is the memory layer for serious fiction: canon, characters, and continuity, not autocomplete. A novelist can ignore a suggestion. The stored canon should not ignore the novelist.',
	'What this argument does not prove':
		'No independent customer evidence is stored, and the founder biography is incomplete. Those gaps stay gaps. This article can say what the product is for, and it cannot say how many authors have finished a book with it or quote a result that was never recorded. Measured proof is missing. A careful reader should treat the argument as a product position, not as a case study. The stored facts are narrow: story memory rather than one-shot generation, author review before a fact enters canon, and the observation that continuity errors are cheaper to catch early than in a late draft. Anything beyond that would be invented, so it is left out.',
	'What a novelist can do with memory':
		'A novelist can keep the accepted facts of the book in one place and return to them when a scene depends on an earlier choice. That is the use of the memory layer. It does not write the novel. It holds canon so the person writing can see a clash before it hardens into the plot. Continuity work is slow on purpose. The next session should start from the manuscript the author is actually writing, not from a fresh guess about who the characters are. If a detail is uncertain, it stays uncertain until the author decides. That is the whole invitation: look at story memory before the book has to be reconstructed from chat logs.',
};

const REVISED_SECTION =
	'A novelist can return to the accepted facts of the book before writing the next scene. Canon stays under author control. Continuity is the work of keeping those facts available. The memory layer does not write the novel.';

function stubAi(): IntelligenceAi {
	return {
		async completeJson<T>(_role: string, messages: Array<{ content: string }>, feature: string) {
			const joined = messages.map((message) => message.content).join('\n');
			if (feature === 'article_outline') {
				return {
					data: {
						title: 'Why a novel needs memory, not another autocomplete pass',
						searchIntent: 'informational',
						sections: Object.keys(SECTIONS).map((heading) => ({
							heading,
							purpose: heading.startsWith('What this') ? 'Name the missing proof and refuse invented evidence.' : `Explain ${heading} from stored Folian facts.`,
						})),
					} as T,
					model: 'stub-strategy',
					estimatedCostUsd: 0,
				};
			}
			if (feature === 'article_section') {
				const heading = Object.keys(SECTIONS).find((item) => joined.includes(item));
				return { data: { body: SECTIONS[heading ?? ''] ?? SECTIONS['What autocomplete cannot hold'] } as T, model: 'stub-writer', estimatedCostUsd: 0 };
			}
			if (feature === 'article_revision') {
				return { data: { body: REVISED_SECTION } as T, model: 'stub-writer', estimatedCostUsd: 0 };
			}
			if (joined.includes('REVISION INSTRUCTION')) {
				return { data: { draft: REVISED_SECTION } as T, model: 'stub-writer', estimatedCostUsd: 0 };
			}
			return {
				data: {
					draft: SOCIAL,
					hook: 'Most writing tools forget the book.',
					argument: 'Canon has to persist with author approval.',
					cta: 'Look at story memory.',
					topic: 'Why autocomplete fails a novel',
				} as T,
				model: 'stub-writer',
				estimatedCostUsd: 0,
			};
		},
	};
}

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({
		authorization: `Bearer ${secret}`,
		action,
		payload,
		idempotencyKey,
	});
}

describe('media planning and long-form articles', () => {
	let secret = '';
	let brandId = '';
	let credentialId = '';
	const store = createMemoryIntelligenceStore();
	const agents = createMemoryAgentStore();
	const native = createMemoryNativeContentStore();
	const previous: Record<string, string | undefined> = {};

	beforeEach(async () => {
		for (const key of ['NATIVE_INTELLIGENCE_ENABLED', 'NATIVE_INTELLIGENCE_BRAND_ALLOWLIST']) {
			previous[key] = process.env[key];
		}
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests(stubAi());
		setAgentStoreForTests(agents);
		setNativeContentStoreForTests(native);
		registerImageProviderForTests(null);
		setImageUploaderForTests();
		const brain = await store.upsertBrandBrain(FOLIAN_USER_ID, FOLIAN_BRAND_ID, {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		brandId = brain.id;
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'true';
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = brain.id;
		const strategy = await store.upsertStrategy(FOLIAN_USER_ID, {
			userId: FOLIAN_USER_ID,
			brandBrainId: brain.id,
			airtableBrandId: FOLIAN_BRAND_ID,
			status: 'active',
			objectives: ['Become the default story-memory layer for serious novelists'],
			audiences: [{ name: 'Serious fiction authors', problems: ['Lost canon'], desiredOutcomes: ['Finish the book'] }],
			audienceProblems: ['Chat tools invent facts'],
			desiredOutcomes: ['Trusted canon'],
			positioning: folianIdentity.positioning,
			keyMessages: ['Memory is the product', 'Authors approve canon', 'Not a ghostwriter'],
			proofPoints: ['Approval before facts persist'],
			contentPillars: ['AI and authorship', 'Continuity craft', 'Author authority'],
			funnelStages: ['awareness'],
			ctaStrategy: { default: 'Invite a look at story memory' },
			contentMix: { linkedin: 0.5 },
			editorialThemes: ['AI and authorship'],
		});
		await store.createTheme(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			strategyId: strategy.id,
			title: 'AI and authorship',
			description: 'Serious writing needs memory, not autocomplete.',
			objective: 'authority',
			targetAudience: 'Serious fiction authors',
			relatedPillars: ['AI and authorship'],
			keyArguments: ['Canon must persist with the author'],
			subtopics: [],
			questionsToAnswer: [],
			proofPoints: [],
			keywords: ['canon', 'authorship'],
			channels: ['linkedin'],
			status: 'active',
		});
		const issued = await issueAgentCredential({
			name: 'Folian Marketing Grok',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [brain.id],
			capabilities: FOLIAN_GROK_CAPABILITIES,
			environment: 'test',
			rateLimit: FOLIAN_GROK_RATE_LIMIT,
		});
		secret = issued.secret;
		credentialId = issued.credential.id;
	});

	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		setAgentStoreForTests(undefined);
		setNativeContentStoreForTests(undefined);
		registerImageProviderForTests(null);
		setImageUploaderForTests();
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it('decides LinkedIn can stay text-only and Instagram needs a visual workflow', async () => {
		const linkedin = await call(
			secret,
			'cce_generate_content',
			{ channel: 'LINKEDIN_PERSONAL', instruction: 'Create the next Folian LinkedIn post about why autocomplete fails a novel.' },
			'li-1',
		);
		expect(linkedin.body.ok).toBe(true);
		const linkedinOutput = (linkedin.body.result as { outputs: Array<{ contentId: string; mediaPlan: MediaDecision; body: string }> }).outputs[0];
		expect(linkedinOutput.mediaPlan).toMatchObject({
			mediaRequired: false,
			mediaRecommended: false,
			mediaRole: 'NONE',
			mediaType: 'NONE',
			generateNow: false,
		});
		expect(linkedinOutput.mediaPlan.reason).toMatch(/text-only/i);
		const refused = await call(secret, 'cce_generate_image', { contentId: linkedinOutput.contentId }, 'li-image');
		expect(refused.body.error?.code).toBe('invalid_input');

		const instagram = await call(
			secret,
			'cce_generate_content',
			{ channel: 'INSTAGRAM_FEED', instruction: 'Create the next Folian Instagram post about canon and continuity.' },
			'ig-1',
		);
		const instagramOutput = (instagram.body.result as { outputs: Array<{ contentId: string; body: string; mediaPlan: MediaDecision }> }).outputs[0];
		expect(instagramOutput.mediaPlan).toMatchObject({
			mediaRequired: true,
			mediaRole: 'REQUIRED_BY_CHANNEL',
			mediaType: 'IMAGE',
			aspectRatio: '4:5',
			preferredSource: 'generate',
			generateNow: false,
		});
		expect(instagramOutput.mediaPlan.visualConcept).toBeTruthy();
		expect(instagramOutput.body).toContain('canon');

		registerImageProviderForTests({
			id: 'fixture',
			configured: () => true,
			async generate() {
				return {
					bytes: Buffer.from('fixture-image'),
					mimeType: 'image/jpeg',
					model: 'fixture-image-1',
					promptUsed: 'internal prompt that must not leave CCE',
					estimatedCostUsd: 0.04,
				};
			},
		});
		setImageUploaderForTests(async () => ({
			secure_url: 'https://res.cloudinary.com/test/image/upload/v1/folian-ig.jpg',
			public_id: 'crisp/test-secret-id',
			width: 1080,
			height: 1350,
		}));
		const image = await call(secret, 'cce_generate_image', { contentId: instagramOutput.contentId }, 'ig-image');
		expect(image.body.ok).toBe(true);
		const asset = (image.body.result as { asset: { id: string; url?: string; approvalStatus: string }; published?: boolean }).asset;
		expect(asset.url).toContain('folian-ig.jpg');
		expect(asset.approvalStatus).toBe('draft');
		expect((image.body.result as { published: boolean }).published).toBe(false);
		const serialised = JSON.stringify(image.body);
		expect(serialised).not.toContain('crisp/test-secret-id');
		expect(serialised).not.toContain('providerAssetId');
		expect(serialised).not.toContain('internal prompt');
		expect(serialised).not.toContain('fixture-image-1');

		const again = await call(secret, 'cce_generate_image', { contentId: instagramOutput.contentId }, 'ig-image-2');
		expect((again.body.result as { reused: boolean; asset: { id: string } }).reused).toBe(true);
		expect((again.body.result as { asset: { id: string } }).asset.id).toBe(asset.id);

		const listed = await call(secret, 'cce_get_assets');
		expect(JSON.stringify(listed.body)).toContain(asset.id);
		expect(JSON.stringify(listed.body)).not.toContain('crisp/test-secret-id');
		const found = await call(secret, 'cce_find_assets', { query: 'autocomplete' });
		expect((found.body.result as { assets: Array<{ id: string }> }).assets.some((item) => item.id === asset.id)).toBe(true);
	});

	it('creates a multi-section article, a hero plan, and an approval gate', async () => {
		const brief = await call(secret, 'cce_create_article_brief', { instruction: 'Identify a substantial article from the current strategy.' }, 'article-brief');
		expect(brief.body.ok).toBe(true);
		expect((brief.body.result as { topic: string }).topic).toBe('AI and authorship');
		expect((brief.body.result as { mediaPlan: MediaDecision }).mediaPlan.mediaRequired).toBe(false);
		expect((brief.body.result as { mediaPlan: MediaDecision }).mediaPlan.generateNow).toBe(false);

		const generated = await call(secret, 'cce_generate_article', { instruction: 'Write from stored strategy and name the gaps.' }, 'article-1');
		expect(generated.body.ok).toBe(true);
		const article = (generated.body.result as {
			published: boolean;
			article: {
				id: string;
				title: string;
				wordCount: number;
				targetWords: number;
				sections: Array<{ id: string; heading: string; body: string }>;
				research: { claims: Array<{ text: string }>; gaps: string[] };
				seo: { slug: string; metaDescription: string; seoTitle: string };
				review: { materialPassed: boolean };
				mediaPlan: { hero: MediaDecision; inline: unknown[] };
				publication: unknown;
				performanceContentId: string;
				status: string;
			};
		}).article;
		expect((generated.body.result as { published: boolean }).published).toBe(false);
		expect(article.sections.length).toBeGreaterThanOrEqual(4);
		expect(article.wordCount).toBeGreaterThan(500);
		expect(article.wordCount).toBeLessThan(article.targetWords);
		expect(article.targetWords).toBe(1500);
		expect(article.title).toMatch(/memory/i);
		expect(article.research.claims.some((claim) => /story memory/i.test(claim.text))).toBe(true);
		expect(article.research.gaps.join(' ')).toMatch(/customer evidence/i);
		expect(article.seo.slug).toMatch(/memory/);
		expect(article.seo.metaDescription.length).toBeGreaterThan(40);
		expect(article.seo.metaDescription.length).toBeLessThanOrEqual(155);
		expect(article.review.materialPassed).toBe(true);
		expect(article.mediaPlan.hero).toMatchObject({ mediaRole: 'SUPPORTING', mediaType: 'HERO_IMAGE', mediaRequired: false, generateNow: false });
		expect(article.mediaPlan.hero.visualConcept).toBeTruthy();
		expect(article.mediaPlan.inline).toEqual([]);
		expect(article.publication).toBeNull();
		expect(article.performanceContentId).toBe(article.id);
		expect(article.status).toBe('draft');
		expect(article.sections.some((section) => /customer evidence/i.test(section.body))).toBe(true);

		const plan = await call(secret, 'cce_get_article_media_plan', { articleId: article.id });
		expect((plan.body.result as { mediaPlan: { hero: { mediaType: string } } }).mediaPlan.hero.mediaType).toBe('HERO_IMAGE');

		const revised = await call(
			secret,
			'cce_request_article_revision',
			{ articleId: article.id, sectionId: article.sections[3].id, instruction: 'Shorten the closing. Do not add proof.' },
			'article-rev',
		);
		expect((revised.body.result as { article: { sections: Array<{ body: string }>; versions: unknown[] } }).article.sections[3].body).toBe(REVISED_SECTION);
		expect((revised.body.result as { article: { versions: unknown[] } }).article.versions.length).toBe(2);

		registerImageProviderForTests({
			id: 'fixture',
			configured: () => true,
			async generate() {
				return { bytes: Buffer.from('hero'), mimeType: 'image/jpeg', model: 'hidden-model', promptUsed: 'hidden prompt', estimatedCostUsd: 0.05 };
			},
		});
		setImageUploaderForTests(async () => ({
			secure_url: 'https://res.cloudinary.com/test/image/upload/v1/folian-hero.jpg',
			public_id: 'crisp/hero-secret',
			width: 1920,
			height: 1080,
		}));
		const hero = await call(secret, 'cce_generate_image', { articleId: article.id }, 'article-hero');
		expect(hero.body.ok).toBe(true);
		const assetId = (hero.body.result as { asset: { id: string } }).asset.id;
		expect(JSON.stringify(hero.body)).not.toContain('crisp/hero-secret');
		expect(JSON.stringify(hero.body)).not.toContain('hidden prompt');

		const attached = await call(secret, 'cce_attach_asset', { assetId, articleId: article.id }, 'article-attach');
		expect((attached.body.result as { attached: boolean; published: boolean }).attached).toBe(true);
		expect((attached.body.result as { published: boolean }).published).toBe(false);
		const fetched = await call(secret, 'cce_get_article', { articleId: article.id });
		expect((fetched.body.result as { article: { featuredAssetId: string } }).article.featuredAssetId).toBe(assetId);

		const submitted = await call(secret, 'cce_submit_article_for_approval', { articleId: article.id }, 'article-submit');
		expect(submitted.body.result).toMatchObject({ status: 'awaiting_approval', approver: 'human', published: false });
		const blocked = await call(secret, 'cce_publish_article', { articleId: article.id }, 'article-publish');
		expect(blocked.body.error?.code).toBe('capability_not_enabled');
		const early = await call(
			secret,
			'cce_record_external_publish',
			{ contentId: article.id, channel: 'blog', externalId: 'ext-1', externalUrl: 'https://example.com/folian/memory' },
			'article-early-publish',
		);
		expect(early.body.error?.code).toBe('content_not_approved');

		const stored = await getNativeContentStore().getArticle(FOLIAN_USER_ID, article.id);
		if (!stored) throw new Error('article missing');
		stored.approval = { ...stored.approval, status: 'approved' };
		await getNativeContentStore().saveArticle(stored);
		const recorded = await call(
			secret,
			'cce_record_external_publish',
			{ contentId: article.id, channel: 'blog', externalId: 'ext-1', externalUrl: 'https://example.com/folian/memory', publishedAt: '2026-10-04T00:00:00.000Z' },
			'article-record',
		);
		expect(recorded.body.result).toMatchObject({ recorded: true, publishedByCce: false, performanceContentId: article.id });
		const after = await getNativeContentStore().getArticle(FOLIAN_USER_ID, article.id);
		expect(after?.publication).toMatchObject({ method: 'external', url: 'https://example.com/folian/memory', externalId: 'ext-1' });
		const links = await getNativeContentStore().listLinks(FOLIAN_USER_ID, 'article', article.id);
		expect(links.some((link) => link.assetId === assetId)).toBe(true);

		const listed = await handleMcpHttp(new Request('https://app.crispdigital.io/api/mcp', {
			method: 'POST',
			headers: { authorization: `Bearer ${secret}`, accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		}));
		const tools = (await listed.json()) as { result: { tools: Array<{ name: string }> } };
		const names = tools.result.tools.map((tool) => tool.name);
		expect(names).toEqual(expect.arrayContaining(['cce_generate_article', 'cce_get_article_media_plan', 'cce_generate_image', 'cce_get_assets']));
		expect(names).not.toContain('cce_publish_article');
		expect(brandId).toBeTruthy();
		expect(credentialId).toBeTruthy();
	});

	it('stops repeated image generation for one target', async () => {
		registerImageProviderForTests({
			id: 'fixture',
			configured: () => true,
			async generate(request) {
				return { bytes: Buffer.from(request.concept), mimeType: 'image/jpeg', model: 'fixture', promptUsed: request.concept, estimatedCostUsd: 0.02 };
			},
		});
		setImageUploaderForTests(async () => ({
			secure_url: 'https://res.cloudinary.com/test/image/upload/v1/cap.jpg',
			public_id: 'crisp/cap-secret',
			width: 1080,
			height: 1350,
		}));
		const decision = (concept: string): MediaDecision => ({
			mediaRequired: true,
			mediaRecommended: true,
			mediaRole: 'REQUIRED_BY_CHANNEL',
			mediaType: 'IMAGE',
			reason: 'test',
			preferredSource: 'generate',
			visualConcept: concept,
			aspectRatio: '4:5',
			textOverlayRecommendation: 'none',
			altTextDirection: 'Describe the image.',
			existingAssetId: null,
			generateNow: false,
		});
		await generateAssetFromProposal({ ownerUserId: FOLIAN_USER_ID, credentialId, brandId, targetType: 'content', targetId: 'same-target', decision: decision('first concept'), rateLimit: FOLIAN_GROK_RATE_LIMIT });
		await generateAssetFromProposal({ ownerUserId: FOLIAN_USER_ID, credentialId, brandId, targetType: 'content', targetId: 'same-target', decision: decision('second concept'), rateLimit: FOLIAN_GROK_RATE_LIMIT });
		await expect(
			generateAssetFromProposal({ ownerUserId: FOLIAN_USER_ID, credentialId, brandId, targetType: 'content', targetId: 'same-target', decision: decision('third concept'), rateLimit: FOLIAN_GROK_RATE_LIMIT }),
		).rejects.toMatchObject({ code: 'rate_limit' });
	});
});
