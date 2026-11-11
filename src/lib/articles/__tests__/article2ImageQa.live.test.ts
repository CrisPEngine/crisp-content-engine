import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { setNativeContentStoreForTests } from '@/lib/media/store';
import { createSupabaseNativeContentStore } from '@/lib/media/supabaseStore';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createSupabaseIntelligenceStore } from '@/lib/intelligence/supabaseStore';

function loadEnv(file: string) {
	for (const line of readFileSync(file, 'utf8').split(/\n/)) {
		if (!line || line.startsWith('#') || !line.includes('=')) continue;
		const i = line.indexOf('=');
		const key = line.slice(0, i);
		let value = line.slice(i + 1);
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		if (!process.env[key]) process.env[key] = value;
	}
}

const live = process.env.RUN_ARTICLE2_IMAGE_QA === '1';

describe.runIf(live)('Article 2 image quality live QA', () => {
	it(
		'prepares a complete visual concept, brand-scoped refs, and optionally regenerates',
		async () => {
			loadEnv('/Users/chrispascoe/Projects/crisp-content-engine/.env.local');
			loadEnv('/Users/chrispascoe/Projects/crisp-content-engine/.env.production.local');
			process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
			// Force production OpenAI key even if an empty local override exists.
			const prod = readFileSync('/Users/chrispascoe/Projects/crisp-content-engine/.env.production.local', 'utf8');
			const openai = prod.split(/\n/).find((line) => line.startsWith('OPENAI_API_KEY='));
			if (openai) {
				let value = openai.slice('OPENAI_API_KEY='.length);
				if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
				process.env.OPENAI_API_KEY = value;
			}
			setNativeContentStoreForTests(createSupabaseNativeContentStore());
			setIntelligenceStoreForTests(createSupabaseIntelligenceStore());

			const { prepareArticleImageBrief, proposeArticleImageReferences, generateArticleMedia, refreshArticleImageAlt } = await import(
				'@/lib/articles/workspace'
			);
			const ownerUserId = '959656d4-b1c2-4d21-bd46-f89f3f41bb0f';
			const articleId = '08776e21-147f-4353-8ad5-10249b8c86c9';
			const prepared = await prepareArticleImageBrief(ownerUserId, articleId, 'hero', {
				applySuggestedConcept: true,
				rebuildPrompt: true,
			});
			const refs = await proposeArticleImageReferences(ownerUserId, articleId, 'hero');
			const concept = prepared.brief.concept;
			expect(concept.endsWith('This i')).toBe(false);
			expect(concept).not.toMatch(/You need enough of a choice to say/);
			expect(concept.split(/\s+/).length).toBeGreaterThanOrEqual(30);
			expect(prepared.brief.prompt).toMatch(/Approved visual concept/);
			expect(refs.proposals.every((row) => !row.asset.brandId || row.asset.brandId === refs.brandId)).toBe(true);

			const summary: Record<string, unknown> = {
				concept,
				wordCount: concept.split(/\s+/).length,
				model: prepared.brief.model,
				estimatedCostUsd: prepared.brief.estimatedCostUsd,
				proposals: refs.proposals.slice(0, 5).map((row) => ({
					title: row.asset.title,
					type: row.typeLabel,
					recommended: row.recommended,
				})),
			};

			if (process.env.ARTICLE2_IMAGE_GENERATE === '1') {
				expect(Boolean(process.env.OPENAI_API_KEY?.trim()), `OPENAI_API_KEY missing (len=${process.env.OPENAI_API_KEY?.length ?? 0})`).toBe(true);
				const { registerImageProviderForTests, imageProviderStatus } = await import('@/lib/media/images');
				const { openaiImageProvider } = await import('@/lib/media/openaiImage');
				registerImageProviderForTests(openaiImageProvider);
				expect(imageProviderStatus().configured).toBe(true);
				const generateRole = async (role: 'hero' | 'og') => {
					const brief =
						role === 'hero'
							? prepared
							: await prepareArticleImageBrief(ownerUserId, articleId, 'og', {
									applySuggestedConcept: true,
									rebuildPrompt: true,
								});
					const generated = await generateArticleMedia(ownerUserId, articleId, role, {
						concept: brief.brief.concept,
						prompt: brief.brief.prompt,
						referenceAssetIds: brief.brief.referenceAssetIds,
						forceNew: true,
					});
					let article = generated;
					const alt = role === 'hero' ? article.workspace?.media?.heroAlt : article.workspace?.media?.ogAlt;
					if (!alt || /^describe /i.test(alt)) {
						article = await refreshArticleImageAlt(ownerUserId, articleId, role);
					}
					return article;
				};
				const heroArticle = await generateRole('hero');
				expect(heroArticle.workspace?.media?.heroUrl).toBeTruthy();
				expect(heroArticle.workspace?.media?.heroAlt || '').not.toMatch(/describe the hero/i);
				summary.generate = {
					heroAlt: heroArticle.workspace?.media?.heroAlt,
					altStatus: heroArticle.workspace?.media?.creative?.hero?.altStatus,
					qualityFindings: heroArticle.workspace?.media?.creative?.hero?.qualityFindings,
					model: heroArticle.workspace?.media?.creative?.hero?.model,
					lastCostUsd: heroArticle.workspace?.media?.creative?.hero?.lastCostUsd,
					candidates: heroArticle.workspace?.media?.creative?.hero?.candidates?.length,
					deliveryVerified: heroArticle.workspace?.media?.deliveryVerified,
				};
				if (process.env.ARTICLE2_IMAGE_GENERATE_OG === '1') {
					const ogArticle = await generateRole('og');
					expect(ogArticle.workspace?.media?.ogUrl).toBeTruthy();
					expect(ogArticle.workspace?.media?.ogAlt || '').not.toMatch(/^describe /i);
					summary.og = {
						concept: ogArticle.workspace?.media?.creative?.og?.concept,
						ogAlt: ogArticle.workspace?.media?.ogAlt,
						altStatus: ogArticle.workspace?.media?.creative?.og?.altStatus,
						model: ogArticle.workspace?.media?.creative?.og?.model,
						lastCostUsd: ogArticle.workspace?.media?.creative?.og?.lastCostUsd,
					};
				}
			}
			console.log(JSON.stringify(summary, null, 2));
		},
		300_000,
	);
});
