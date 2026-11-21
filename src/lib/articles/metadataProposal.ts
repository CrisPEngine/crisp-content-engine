import type { ArticleRecord } from './types';
import { isMetadataProposalDocument, parseMetadataProposal } from '@/lib/campaigns/optimisation';

export type MetadataProposalInput = {
	proposedSeoTitle: string;
	proposedMetaDescription: string;
	rationale: string;
	evidence: string;
	sourceUrl: string;
	baselineCmsRevision: number | null;
	baselineContentRevisionId: string | null;
};

export function storeMetadataProposal(article: ArticleRecord, input: MetadataProposalInput, at = new Date().toISOString()): void {
	const body = article.body;
	const workspace = article.workspace;
	if (!workspace) throw new Error('Article workspace is missing.');
	const previous = workspace.metadataProposal;
	const history = [...(previous?.history ?? [])];
	if (previous) {
		history.push({
			at,
			status: previous.status === 'approved' ? 'historical' : previous.status,
			proposedSeoTitle: previous.proposedSeoTitle,
			proposedMetaDescription: previous.proposedMetaDescription,
		});
	}
	history.push({ at, status: 'pending', proposedSeoTitle: input.proposedSeoTitle, proposedMetaDescription: input.proposedMetaDescription });
	workspace.metadataProposal = {
		status: 'pending',
		proposedSeoTitle: input.proposedSeoTitle,
		proposedMetaDescription: input.proposedMetaDescription,
		rationale: input.rationale,
		evidence: input.evidence,
		sourceUrl: input.sourceUrl,
		baselineCmsRevision: input.baselineCmsRevision,
		baselineContentRevisionId: input.baselineContentRevisionId,
		history,
	};
	workspace.cms.baselineRevision = input.baselineCmsRevision;
	if (workspace.brief) {
		workspace.brief = {
			...workspace.brief,
			instructions: input.rationale || workspace.brief.instructions,
			referenceMaterial: input.evidence || workspace.brief.referenceMaterial,
		};
	}
	if (article.body !== body) throw new Error('The article body changed while the metadata proposal was stored.');
}

export function approveMetadataProposalRecord(article: ArticleRecord, at = new Date().toISOString()): void {
	const proposal = article.workspace?.metadataProposal;
	if (!proposal || proposal.status === 'rejected') throw new Error('There is no metadata proposal to approve.');
	proposal.history = [...proposal.history, { at, status: 'approved', proposedSeoTitle: proposal.proposedSeoTitle, proposedMetaDescription: proposal.proposedMetaDescription }];
	proposal.status = 'approved';
	article.seo = {
		...article.seo,
		seoTitle: proposal.proposedSeoTitle,
		metaDescription: proposal.proposedMetaDescription,
	};
}

export function metadataProposalFromBody(body: string, baselineCmsRevision: number | null, baselineContentRevisionId: string | null): MetadataProposalInput | null {
	if (!isMetadataProposalDocument(body)) return null;
	const parsed = parseMetadataProposal(body);
	if (!parsed) return null;
	return {
		proposedSeoTitle: parsed.proposedTitle,
		proposedMetaDescription: parsed.proposedDescription,
		rationale: parsed.rationale,
		evidence: parsed.evidence,
		sourceUrl: parsed.sourceUrl,
		baselineCmsRevision,
		baselineContentRevisionId,
	};
}
