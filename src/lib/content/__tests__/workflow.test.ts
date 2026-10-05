import { describe, expect, it } from 'vitest';
import { mergeApprovalItems, workflowStatus } from '@/lib/content/workflow';
import { nativeStrategyDocument } from '@/lib/intelligence/strategyView';
import { selectRelevantResearch } from '@/lib/research/retrieve';
import { connectionHealth, destinationsForBrand } from '@/lib/social/destinations';
import type { ResearchRecord } from '@/lib/agent/types';
import type { BrandStrategy } from '@/lib/intelligence/types';
import { AGENT_ACTIONS } from '@/lib/agent/registry';

function research(id: string, request: string, claims: string[]): ResearchRecord {
	return { id, brandId: 'brand', request, sources: [], claims: claims.map((text) => ({ text })), createdAt: new Date().toISOString(), note: 'not a fact' };
}

describe('content workflow', () => {
	it('does not treat approval as a schedule', () => {
		expect(workflowStatus({ publicationStatus: 'review' })).toBe('NEEDS_APPROVAL');
		expect(workflowStatus({ publicationStatus: 'approved' })).toBe('APPROVED_UNSCHEDULED');
		expect(workflowStatus({ publicationStatus: 'approved', publicationDate: '2026-10-07T05:30:00.000Z' })).toBe('SCHEDULED');
		expect(workflowStatus({ publicationStatus: 'draft' })).toBe('DRAFT');
	});

	it('shows one row when native content already has an Airtable copy', () => {
		const airtable: Array<{ id: string; airtableContentId?: string | null }> = [{ id: 'rec1' }];
		const native: Array<{ id: string; airtableContentId?: string | null }> = [
			{ id: 'native-1', airtableContentId: 'rec1' },
			{ id: 'native-2', airtableContentId: null },
		];
		expect(mergeApprovalItems(airtable, native).map((item) => item.id)).toEqual(['rec1', 'native-2']);
	});
});

describe('research retrieval', () => {
	it('uses stored ChatGPT research without asking the agent to attach it again', () => {
		const records = [research('c6', 'Dated source check on ChatGPT advertising', ['Ads Manager is in beta'])];
		const selected = selectRelevantResearch(records, 'Create a CrisP Digital LinkedIn post about ChatGPT advertising for UAE businesses.');
		expect(selected.map((item) => item.id)).toEqual(['c6']);
		const attached = selectRelevantResearch(records, 'Write a short post about planning.', ['c6']);
		expect(attached).toHaveLength(1);
	});
});

describe('strategy and destinations', () => {
	it('renders native strategy for the master strategy screen', () => {
	const strategy = {
		id: 's',
		userId: 'u',
		brandBrainId: 'b',
		airtableBrandId: 'rec',
		status: 'active',
		objectives: ['Build authority'],
		audiences: [{ name: 'Founders' }],
		audienceProblems: [],
		desiredOutcomes: [],
		positioning: 'Practical AI',
		keyMessages: ['Start with the problem'],
		proofPoints: [],
		contentPillars: ['AI enablement'],
		funnelStages: [],
		ctaStrategy: {},
		contentMix: {},
		editorialThemes: [],
		campaigns: [],
		channelStrategies: [{ id: 'c', strategyId: 's', channel: 'linkedin', cadence: 'weekly', formats: [], constraints: [] }],
	} satisfies BrandStrategy;
		const view = nativeStrategyDocument(strategy, []);
		expect(view.positioning).toBe('Practical AI');
		expect(view.source).toBe('native');
	});

	it('exposes the research MCP tools by their implemented names', () => {
		const names = AGENT_ACTIONS.map((action) => action.name);
		for (const name of [
			'cce_research_brand',
			'cce_research_topic',
			'cce_research_competitors',
			'cce_research_reviews',
			'cce_get_research',
			'cce_get_research_status',
			'cce_get_sources',
			'cce_get_findings',
			'cce_get_claim_evidence',
			'cce_get_competitors',
			'cce_get_reviews_summary',
			'cce_get_trends',
			'cce_refresh_research',
			'cce_propose_brand_brain_updates',
		]) {
			expect(names).toContain(name);
		}
		expect(names).toContain('cce_resolve_approval_request');
		expect(AGENT_ACTIONS.find((action) => action.name === 'cce_approve_content')?.capability).toBe('content:approve');
	});

	it('keeps brand destinations isolated and marks expired tokens', () => {
		const destinations = [
			{ id: 'ig-crisp', authorizationId: 'meta', provider: 'meta', destinationType: 'instagram' as const, providerDestinationId: '1', displayName: 'CrisP', handle: 'crisp_digital', status: 'CONNECTED' as const },
			{ id: 'ig-folian', authorizationId: 'meta', provider: 'meta', destinationType: 'instagram' as const, providerDestinationId: '2', displayName: 'Folian', handle: 'folian.app', status: 'CONNECTED' as const },
		];
		const links = [
			{ brandId: 'crisp', destinationId: 'ig-crisp', purpose: 'default_publish' as const, enabled: true },
			{ brandId: 'folian', destinationId: 'ig-folian', purpose: 'default_publish' as const, enabled: true },
		];
		expect(destinationsForBrand('folian', links, destinations).map((item) => item.handle)).toEqual(['folian.app']);
		expect(destinationsForBrand('crisp', links, destinations).map((item) => item.handle)).toEqual(['crisp_digital']);
		expect(connectionHealth({ expiresAt: '2020-01-01T00:00:00.000Z' })).toBe('EXPIRED');
		expect(connectionHealth({ reconnectRequired: true })).toBe('ACTION_REQUIRED');
	});
});
