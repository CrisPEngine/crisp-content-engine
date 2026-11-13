import { describe, expect, it } from 'vitest';
import { usableCapabilities, type ProductCapability } from '@/lib/articles/productKnowledge';
import { folianOfficialSiteDrafts, isFolianOfficialSite } from '@/lib/intelligence/knowledge/folianOfficialSite';
import { draftsForBrand } from '@/lib/intelligence/knowledge/repository';
import { publicationBlocks, resolveIntelligence } from '@/lib/intelligence/knowledge/resolver';
import { stuckStrategyRecovery } from '@/lib/intelligence/strategy/stuckStrategy';
import type { BrandBrain, BrandStrategy, UserEditLearning } from '@/lib/intelligence/types';

const brain = {
	id: 'brain-1',
	userId: 'user-1',
	airtableBrandId: 'rec',
	identity: { name: 'Example', website: 'https://example.com', positioning: 'A services firm.', productsServices: ['Website design', 'A long marketing sentence that is not a product name but still listed.'] },
	voice: {},
	guardrails: { prohibitedClaims: ['Guarantees a contradiction-free manuscript.'] },
	knowledge: { productFacts: ['This sentence is not a verified feature.'] },
	examples: [],
	updatedAt: '2026-11-13T00:00:00.000Z',
} as BrandBrain;

describe('brand knowledge', () => {
	it('keeps the Folian public-site catalogue unverified', () => {
		const drafts = folianOfficialSiteDrafts();
		expect(drafts.length).toBeGreaterThan(8);
		expect(drafts.every((item) => item.verificationStatus === 'verification_required')).toBe(true);
		expect(drafts.find((item) => item.name === 'Folian Studio')?.availability).toBe('private_preview');
		expect(drafts.find((item) => item.naturalKey === 'capability:ask-folian')?.verificationStatus).toBe('verification_required');
		expect(drafts.every((item) => item.verificationStatus === 'verification_required')).toBe(true);
		expect(drafts.find((item) => item.naturalKey === 'capability:windows')?.availability).toBe('in_development');
		expect(drafts.some((item) => item.prohibited)).toBe(true);
		expect(isFolianOfficialSite('https://folian.app')).toBe(true);
		expect(isFolianOfficialSite('https://www.premiumdiecast.com')).toBe(false);
	});

	it('proposes listed services for a non-product brand without inventing capabilities', () => {
		const { drafts } = draftsForBrand(brain);
		expect(drafts.every((item) => item.recordType === 'product')).toBe(true);
		expect(drafts.every((item) => item.verificationStatus === 'verification_required')).toBe(true);
	});

	it('gives generation and review the same verified set', () => {
		const verified: ProductCapability = {
			id: 'cap-1',
			name: 'Story Bible',
			description: 'Characters and places stay with the manuscript.',
			availability: 'beta',
			evidence: 'Public product page.',
			lastVerified: '2026-11-13',
			verificationStatus: 'verified',
		};
		const planned: ProductCapability = { ...verified, id: 'cap-2', name: 'Folian Studio', availability: 'planned', verificationStatus: 'verification_required' };
		const snapshot = {
			available: true,
			products: [],
			sources: [],
			proposals: [],
			claims: [{ id: 'claim-1', claimText: 'Guarantees a contradiction-free manuscript.', verificationStatus: 'verification_required' as const, approvalStatus: 'approved', prohibited: true }],
			capabilities: [],
		};
		const resolved = resolveIntelligence({
			brain: { ...brain, knowledge: { capabilities: [verified, planned] } },
			strategy: { id: 's1', status: 'active', objectives: ['Explain the writing workflow'], contentPillars: ['Planning'], positioning: 'Writer-first.' } as BrandStrategy,
			snapshot,
			learnings: [{ id: 'l1', brandBrainId: brain.id, signalType: 'editorial', observation: 'Open with a practical problem.', confidence: 'candidate', status: 'accepted', occurrenceCount: 2 } as UserEditLearning],
			topic: 'story bible continuity',
			task: 'article',
		});
		expect(resolved.verified.map((item) => item.name)).toEqual(['Story Bible']);
		expect(resolved.planned.map((item) => item.name)).toEqual(['Folian Studio']);
		expect(resolved.prompt).toContain('Story Bible');
		expect(resolved.prompt).not.toContain('This sentence is not a verified feature');
		expect(publicationBlocks('The app guarantees a contradiction-free manuscript.', resolved)).toHaveLength(1);
	});

	it('does not treat evidence without an explicit verified status as usable when status is set', () => {
		const row: ProductCapability = {
			id: 'cap',
			name: 'Export',
			description: 'Export is mentioned.',
			availability: 'beta',
			evidence: 'A website sentence.',
			lastVerified: '2026-11-13',
			verificationStatus: 'verification_required',
		};
		expect(usableCapabilities([row])).toHaveLength(0);
		expect(usableCapabilities([{ ...row, verificationStatus: undefined }])).toHaveLength(1);
	});

	it('fails a strategy that has been generating for more than two hours without changing its content', () => {
		const strategy = {
			id: 's',
			status: 'draft',
			objectives: ['Keep the existing objective'],
			contentPillars: ['Blog content'],
			generationMetadata: { phase: 'generating', startedAt: '2026-10-22T09:39:03.466Z' },
		} as BrandStrategy;
		const recovered = stuckStrategyRecovery(strategy, Date.parse('2026-11-13T00:00:00.000Z'));
		expect(recovered?.generationMetadata?.phase).toBe('failed');
		expect(recovered?.status).toBe('draft');
		expect(recovered?.objectives).toEqual(['Keep the existing objective']);
		expect(stuckStrategyRecovery({ ...strategy, generationMetadata: { phase: 'generating', startedAt: '2026-11-13T00:00:00.000Z' } }, Date.parse('2026-11-13T01:00:00.000Z'))).toBeNull();
	});
});
