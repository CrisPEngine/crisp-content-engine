import { describe, expect, it } from 'vitest';
import type { ResearchRecord } from '@/lib/agent/types';
import type { ResearchPacket } from '@/lib/research/types';
import {
	addUserEvidence,
	approveResearch,
	articleResearchFromApproved,
	briefTerms,
	emptyResearchPackage,
	mergeResearchRecord,
	researchApprovalGap,
	setItemExcluded,
} from '../researchPackage';
import type { ArticleRecord } from '../types';

const article = {
	topic: 'How to write a novel: from idea to first draft',
	title: 'How to Write a Novel: From Idea to First Draft',
	primaryKeyword: 'how to write a novel',
	workspace: undefined,
} as unknown as ArticleRecord;

function record(sources: Array<{ id: string; url: string; title: string; excerpt?: string }>, findings: Array<{ text: string; sourceIds: string[] }>): ResearchRecord {
	return {
		id: crypto.randomUUID(),
		brandId: 'brand',
		request: 'How to write a novel',
		sources: [],
		claims: [],
		createdAt: '2026-11-08T08:00:00.000Z',
		note: '',
		packet: {
			sources: sources.map((source) => ({ ...source, domain: new URL(source.url).hostname, retrievedAt: '2026-11-08T08:00:00.000Z', sourceClass: 'UNKNOWN' })),
			findings: findings.map((finding, index) => ({ id: `f${index}`, text: finding.text, sourceIds: finding.sourceIds, knowledgeClass: 'THIRD_PARTY_CLAIM', state: 'OBSERVED' })),
			claims: [],
			competitors: [],
			gaps: [],
		} as unknown as ResearchPacket,
	};
}

describe('article research package', () => {
	it('deduplicates repeated sources and findings across runs', () => {
		const pkg = emptyResearchPackage();
		const terms = briefTerms(article);
		const run = record(
			[
				{ id: 's1', url: 'https://thewritepractice.com/how-to-write-a-novel/?utm_source=x', title: 'How to Write a Novel in 15 Steps' },
				{ id: 's2', url: 'https://www.thewritepractice.com/how-to-write-a-novel', title: 'How to Write a Novel in 15 Steps' },
			],
			[
				{ text: 'Write a novel by finishing a messy first draft before revising any chapter.', sourceIds: ['s1'] },
				{ text: 'Write a novel by finishing a messy first draft before revising any chapter.', sourceIds: ['s2'] },
			],
		);
		mergeResearchRecord(pkg, run, { terms, brandDomain: 'folian.app', kind: 'initial', question: null });
		mergeResearchRecord(pkg, run, { terms, brandDomain: 'folian.app', kind: 'follow_up', question: 'again' });
		expect(pkg.sources).toHaveLength(1);
		expect(pkg.items.filter((item) => !item.excluded)).toHaveLength(1);
		expect(pkg.version).toBe(2);
		expect(pkg.updates.map((update) => update.kind)).toEqual(['initial', 'follow_up']);
	});

	it('excludes results about an unrelated person and keeps the reason', () => {
		const pkg = emptyResearchPackage();
		mergeResearchRecord(
			pkg,
			record(
				[{ id: 'p', url: 'https://example-news.com/chris-folayan', title: 'Chris Folayan, founder of MallforAfrica', excerpt: 'Chris Folayan is an entrepreneur in ecommerce.' }],
				[{ text: 'Chris Folayan founded MallforAfrica to sell products from global retailers.', sourceIds: ['p'] }],
			),
			{ terms: briefTerms(article), brandDomain: 'folian.app', kind: 'initial', question: null },
		);
		expect(pkg.sources[0].excluded).toBe(true);
		expect(pkg.sources[0].excludedReason).toMatch(/Not related/);
		expect(pkg.items[0].excluded).toBe(true);
	});

	it('approves a snapshot that later edits do not change, and generation reads only the snapshot', () => {
		const pkg = emptyResearchPackage();
		mergeResearchRecord(
			pkg,
			record(
				[{ id: 's', url: 'https://advancedfictionwriting.com/articles/snowflake-method/', title: 'The Snowflake Method for designing a novel' }],
				[{ text: 'The Snowflake Method grows a one-sentence novel summary into a full scene list.', sourceIds: ['s'] }],
			),
			{ terms: briefTerms(article), brandDomain: 'folian.app', kind: 'initial', question: null },
		);
		addUserEvidence(pkg, 'I finished my first novel by writing 500 words before work every day.');
		approveResearch(pkg);
		const approvedVersion = pkg.version;
		setItemExcluded(pkg, pkg.items[0].id, true, 'Not needed');
		expect(pkg.status).toBe('changed_since_approval');
		expect(researchApprovalGap(pkg).required).toBe(true);
		expect(researchApprovalGap(pkg).message).toContain(`approved version ${approvedVersion}`);
		expect(researchApprovalGap(pkg).changes.every((update) => update.version > approvedVersion)).toBe(true);
		const research = articleResearchFromApproved(pkg);
		expect(research.packageVersion).toBe(approvedVersion);
		expect(research.claims.map((claim) => claim.text)).toContain('The Snowflake Method grows a one-sentence novel summary into a full scene list.');
		expect(research.claims.find((claim) => claim.kind === 'user')?.sourceLabel).toBe('Author');
		expect(research.sources.find((source) => source.url)?.label).toBe('The Snowflake Method for designing a novel');
	});
});
