import { describe, expect, it } from 'vitest';
import { applyModelStrategy, buildEditorialBrief, generationContextFromBrief, reviseBrief, sectionResearchQuestion } from '@/lib/articles/editorialBrief';
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

	it('keeps model strategy out of confirmed evidence and drops invented search metrics', () => {
		const research = emptyResearchPackage();
		research.status = 'approved';
		research.items = [{ id: '1', kind: 'topic', text: 'Writers report losing track of injuries across chapters.', sourceIds: [], supported: true, relevance: 1, addedInVersion: 1, excluded: false, excludedReason: null }];
		research.approved = { version: 1, approvedAt: '2026-11-11T00:00:00.000Z', sources: [], items: research.items, notes: '', expertise: '' };
		const base = buildEditorialBrief({
			topic: 'How novelists prevent continuity errors',
			title: 'How to Prevent Continuity Errors in a Novel',
			searchIntent: 'informational',
			targetWords: 1800,
			research,
			capabilities: [canon, { id: 'soon', name: 'Automatic contradiction scan', description: 'Finds conflicts.', availability: 'planned' }],
			brandName: 'Folian',
		} as never);
		const next = applyModelStrategy(base, {
			primaryKeyword: 'continuity errors',
			supportingKeywords: ['12,000 monthly searches', 'story bible'],
			seoTitle: 'How to prevent continuity errors',
			publishedH1: 'How to Prevent Continuity Errors in a Novel',
			sections: [
				{ heading: 'Detect a contradiction', level: 2, questions: ['How do writers find a contradiction?'], examples: ['A radio that cannot transmit'], evidenceNeeded: ['An independent editing source'], proposedDirection: 'Proposed detection method.' },
				{ heading: 'Check the later chapter', level: 3, parentHeading: 'Detect a contradiction', questions: ['What gets checked?'] },
			],
			targetWords: 2200,
			differentiation: 'This keyword ranks #1.',
			brandPositioning: 'Automatic contradiction scan is ready for writers.',
			internalLinks: ['/how-to-write-a-novel'],
		}, ['How to Write a Novel']);
		expect(next.confirmed).toEqual(base.confirmed);
		expect(next.capabilities).toEqual(base.capabilities);
		expect(next.supportingKeywords).toEqual(['story bible']);
		expect(next.sections.map((section) => section.level)).toEqual([2, 3]);
		expect(next.sections[0]?.researchGap).toBe(true);
		expect(next.differentiation).toContain('How to Write a Novel');
		expect(next.differentiation).not.toMatch(/#1/);
		expect(next.targetWords).toBe(2200);
		expect(next.brandRelevance).toBe(base.brandRelevance);
		expect(sectionResearchQuestion(next.sections[0]!).startsWith('Research only this section:')).toBe(true);
	});

	it('rejects misspelled and duplicate keywords and adds an H3 only when a long guide has a second question', () => {
		const base = buildEditorialBrief({
			topic: 'How to prevent continuity errors in a novel',
			title: 'How to Prevent Continuity Errors in a Novel: A Practical Guide',
			searchIntent: 'informational',
			primaryKeyword: 'novel continuity errors',
			targetWords: 2200,
		} as never);
		const next = applyModelStrategy(base, {
			primaryKeyword: 'continuity cheeck',
			supportingKeywords: ['novel continuity errors', 'story bible', 'crypto wallets', '12,000 monthly searches'],
			sections: [
				{ heading: 'Build a story bible', level: 2, questions: ['What belongs in a story bible?', 'Which facts need a second check?'] },
				{ heading: 'Build a story bible', level: 2, questions: ['Duplicate heading'] },
				{ heading: 'Crypto wallet setup', level: 2, questions: ['Unrelated'] },
			],
		});
		expect(next.primaryKeyword).toBe('novel continuity errors');
		expect(next.supportingKeywords).toEqual(['story bible', 'crypto wallets']);
		expect(next.proposed.some((line) => /cheeck/.test(line) && /check/.test(line))).toBe(true);
		expect(next.proposed.some((line) => /crypto wallets/.test(line))).toBe(true);
		expect(next.sections.map((section) => [section.level, section.heading])).toEqual([
			[2, 'Build a story bible'],
			[3, 'Which facts need a second check'],
			[2, 'Crypto wallet setup'],
		]);
		expect(next.proposed.some((line) => /Crypto wallet setup/.test(line))).toBe(true);
		expect(next.confirmed).toEqual(base.confirmed);
		const short = applyModelStrategy(
			buildEditorialBrief({ topic: 'What is a story bible', title: 'What is a story bible', searchIntent: 'informational', targetWords: 800 } as never),
			{ sections: [{ heading: 'Define a story bible', level: 2, questions: ['What is it?', 'What does it contain?'] }] },
		);
		expect(short.sections.every((section) => section.level !== 3)).toBe(true);
	});

	it('does not treat planned capabilities as usable', () => {
		const planned: ProductCapability = { id: 'p', name: 'Future scan', description: 'Not shipped.', availability: 'planned' };
		const retired: ProductCapability = { ...canon, id: 'old', availability: 'deprecated', evidence: 'Removed from the product.', lastVerified: '2026-11-01' };
		expect(usableCapabilities([canon, planned, retired]).map((item) => item.id)).toEqual(['canon']);
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
