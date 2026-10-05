import type { BrandBrainProposal, KnowledgeClass, ResearchClaim, ResearchContradiction } from './types';

const PRICE = /\$\s?(\d+(?:\.\d{1,2})?)/;

function prices(text: string): string[] {
	return [...text.matchAll(new RegExp(PRICE.source, 'g'))].map((match) => match[1]);
}

export function findContradictions(brandFacts: string[], claims: Array<{ text: string; sourceId: string }>): ResearchContradiction[] {
	const contradictions: ResearchContradiction[] = [];
	for (const fact of brandFacts) {
		const factPrices = prices(fact);
		if (factPrices.length === 0) continue;
		for (const claim of claims) {
			const claimPrices = prices(claim.text);
			const differs = claimPrices.find((price) => !factPrices.includes(price));
			if (!differs) continue;
			contradictions.push({
				id: `contradiction-${contradictions.length + 1}`,
				topic: 'pricing',
				evidenceA: fact,
				evidenceB: claim.text,
				sourceIds: [claim.sourceId],
				likelyResolution: 'Prefer the newer first-party price as a proposal. Do not overwrite the stored fact until a person confirms it.',
				confirmationNeeded: true,
			});
		}
	}
	return contradictions;
}

const NEVER_PROMOTE: KnowledgeClass[] = ['COMPETITOR_CLAIM', 'CUSTOMER_REVIEW', 'PUBLIC_OPINION', 'INFERENCE', 'CCE_HYPOTHESIS', 'THIRD_PARTY_CLAIM', 'NEWS'];

export function proposeBrandUpdate(claim: Pick<ResearchClaim, 'text' | 'knowledgeClass' | 'state' | 'sourceIds'>): BrandBrainProposal | null {
	if (NEVER_PROMOTE.includes(claim.knowledgeClass)) return null;
	if (claim.state === 'REJECTED' || claim.state === 'STALE') return null;
	const requiresConfirmation = claim.state !== 'USER_CONFIRMED';
	return {
		id: `proposal-${claim.sourceIds[0] ?? 'claim'}`,
		field: claim.knowledgeClass === 'FIRST_PARTY_VERIFIED' || claim.knowledgeClass === 'FIRST_PARTY_CLAIM' ? 'productFacts' : 'brandFacts',
		text: claim.text,
		state: claim.state,
		knowledgeClass: claim.knowledgeClass,
		sourceIds: claim.sourceIds,
		requiresConfirmation,
	};
}

export function canApplyProposal(proposal: BrandBrainProposal, actor: 'user' | 'agent' | 'research'): boolean {
	return actor === 'user' && proposal.state === 'USER_CONFIRMED' && !NEVER_PROMOTE.includes(proposal.knowledgeClass);
}
