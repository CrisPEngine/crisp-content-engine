import { describe, expect, it } from 'vitest';
import { buildEditorialBrief, generationContextFromBrief, reviseBrief } from '@/lib/articles/editorialBrief';
import { reconcileCritique } from '@/lib/articles/editorialDesk';
import { detectKnowledgeGaps, usableCapabilities, type ProductCapability } from '@/lib/articles/productKnowledge';
import { classifySource, evidenceLevel, withSourceClasses } from '@/lib/articles/sourceClass';
import { emptyResearchPackage } from '@/lib/articles/researchPackage';
import { validateForDestination, PAYLOAD_CONTENT_CAPABILITIES } from '@/lib/destinations/contentCapabilities';
import { toCanonicalArticle } from '@/lib/articles/canonical';

const canon: ProductCapability = {
	id: 'canon',
	name: 'Story memory',
	description: 'Keeps approved story facts available while drafting.',
	availability: 'available',
	evidence: 'Product documentation, reviewed 2026-11-01.',
	lastVerified: '2026-11-01',
	approvedLanguage: 'Keeps approved story facts available while you draft.',
};

describe('research-led editorial workflow', () => {
	it('classifies vendor comparison pages as marketing, not expert guidance', () => {
		const source = { domain: 'inkfluenceai.com', url: 'https://inkfluenceai.com/best', title: 'Best AI for Novel Continuity Checking (2026): 5 Tools Compared', origin: 'search' as const };
		expect(classifySource(source)).toBe('vendor_marketing');
		expect(evidenceLevel('vendor_marketing')).toBe('background');
		const stored = withSourceClasses([{ ...source, classification: 'expert_guidance' }], {});
		expect(stored[0]?.classification).toBe('vendor_marketing');
	});

	it('separates confirmed research from proposed direction and versions an approved brief', () => {
		const research = emptyResearchPackage();
		research.status = 'approved';
		research.items = [{ id: '1', kind: 'topic', text: 'Writers report losing track of injuries across chapters.', sourceIds: [], supported: true, relevance: 1, addedInVersion: 1, excluded: false, excludedReason: null }];
		research.approved = { version: 1, approvedAt: '2026-11-11T00:00:00.000Z', sources: [], items: research.items, notes: '', expertise: '' };
		const brief = buildEditorialBrief({
			topic: 'How novelists prevent continuity errors',
			title: 'How to Prevent Continuity Errors in a Novel',
			searchIntent: 'informational',
			targetWords: 2200,
			research,
			capabilities: [canon, { id: 'soon', name: 'Automatic contradiction scan', description: 'Finds conflicts across chapters.', availability: 'planned' }],
			brandName: 'Folian',
			brief: { questions: 'Can Folian identify conflicting character attributes across chapters?' },
		} as never);
		expect(brief.confirmed.some((line) => line.startsWith('Research:'))).toBe(true);
		expect(brief.confirmed.some((line) => /Story memory/.test(line))).toBe(true);
		expect(brief.proposed.some((line) => /proposal|Proposed/i.test(line))).toBe(true);
		expect(brief.claimsToVerify.some((item) => /Folian/i.test(item))).toBe(true);
		expect(brief.capabilities.find((item) => item.name === 'Automatic contradiction scan')?.verified).toBe(false);
		const revised = reviseBrief({ ...brief, status: 'approved', approvedAt: '2026-11-11T00:00:00.000Z' }, { ...brief, instruction: 'Make it more technical.' });
		expect(revised.current.status).toBe('needs_reapproval');
		expect(revised.history[0]?.status).toBe('approved');
		expect(generationContextFromBrief(revised.current)).toBe('');
		expect(generationContextFromBrief(revised.history[0])).toContain('Approved editorial brief');
	});

	it('does not treat planned capabilities as usable', () => {
		const planned: ProductCapability = { id: 'p', name: 'Future scan', description: 'Not shipped.', availability: 'planned' };
		expect(usableCapabilities([canon, planned]).map((item) => item.id)).toEqual(['canon']);
		const gaps = detectKnowledgeGaps(['Can the software run the future scan?'], [planned], 'Folian');
		expect(gaps[0]?.status).toBe('not_yet_available');
	});

	it('resolves critique findings that the next assessment no longer raises', () => {
		const previous = {
			revisionId: 'r1',
			createdAt: 't',
			overall: 'Needs work',
			strengths: [],
			weaknesses: [],
			findings: [{ id: 'cta-weak', category: 'conversion' as const, severity: 'major' as const, section: null, explanation: 'Weak close', evidence: [], recommendation: 'Strengthen', expectedBenefit: 'Clearer', confidence: 'high' as const, status: 'open' as const }],
		};
		const next = reconcileCritique(previous, { overall: 'Improved', strengths: [], weaknesses: [], findings: [] });
		expect(next.findings[0]?.status).toBe('resolved');
	});

	it('validates a canonical article against destination capabilities without assuming a live publish', () => {
		const article = {
			title: 'Guide',
			slug: 'guide',
			body: '## Method\n\nA paragraph.\n\n| Fact | Where |\n| --- | --- |\n| Name | Chapter 1 |',
			excerpt: 'A guide',
			seo: { title: 'Guide', seoTitle: 'Guide', slug: 'guide', excerpt: 'A guide', metaDescription: 'A guide for writers.', canonical: null, primaryKeyword: null, secondaryTopics: [] },
			searchIntent: 'informational',
			categories: ['writing'],
			tags: [],
			audience: 'writers',
			workspace: { contentType: 'article', media: { heroUrl: null, heroAlt: '' } },
		};
		const canonical = toCanonicalArticle(article as never, { destination: 'example', schemaVersion: 1, categoryCreationPolicy: 'closed', categories: [{ id: 'writing', name: 'Writing', description: '' }], contentTypes: ['article'], tags: { policy: 'open' }, tools: [] });
		const issues = validateForDestination(canonical, PAYLOAD_CONTENT_CAPABILITIES);
		expect(issues.filter((issue) => issue.severity === 'blocking')).toEqual([]);
	});
});
