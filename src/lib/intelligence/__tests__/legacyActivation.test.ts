import { describe, expect, it } from 'vitest';
import { createMemoryIntelligenceStore } from '../memoryStore';
import { activateLegacyBrand } from '../legacy/activate';
import { auditBrandChannels } from '../legacy/channels';
import { memoryFromQueueItem, reconcileLegacyProfiles } from '../legacy/reconcile';
import { CRISP_CANONICAL_AIRTABLE_ID, CRISP_RECONCILIATION_REASON, CRISP_RETAINED_PRODUCT_PROFILE_ID, crispGuardrails, crispIdentity, crispKnowledge, crispThemes, crispVoice } from '../crisp/nativeBrand';

const OWNER = 'user-chris';
const OTHER = 'user-other';

describe('legacy brand reconciliation', () => {
	it('requires an explicit same-owner choice and keeps both records', () => {
		const decision = reconcileLegacyProfiles({
			expectedOwnerUserId: OWNER,
			selectedId: CRISP_CANONICAL_AIRTABLE_ID,
			reason: CRISP_RECONCILIATION_REASON,
			profiles: [
				{ id: CRISP_CANONICAL_AIRTABLE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
				{ id: CRISP_RETAINED_PRODUCT_PROFILE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
			],
		});
		expect(decision.selectedId).toBe(CRISP_CANONICAL_AIRTABLE_ID);
		expect(decision.retainedIds).toEqual([CRISP_CANONICAL_AIRTABLE_ID, CRISP_RETAINED_PRODUCT_PROFILE_ID]);
	});

	it('stops when a same-name profile belongs to someone else', () => {
		expect(() => reconcileLegacyProfiles({
			expectedOwnerUserId: OWNER,
			selectedId: CRISP_CANONICAL_AIRTABLE_ID,
			reason: 'same owner',
			profiles: [
				{ id: CRISP_CANONICAL_AIRTABLE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
				{ id: 'rec-other', clientName: 'CrisP Digital', ownerUserId: OTHER },
			],
		})).toThrow(/different CCE user/);
	});

	it('does not treat an unpublished queue item as published', () => {
		expect(memoryFromQueueItem({ id: 'rec1', platform: 'LinkedIn', status: 'Scheduled', hook: 'A question' })?.publicationStatus).toBe('scheduled');
		expect(memoryFromQueueItem({ id: 'rec2', platform: 'LinkedIn', status: 'Draft', body: 'Body' })?.publicationStatus).toBe('draft');
		expect(memoryFromQueueItem({ id: 'rec3', status: 'Needs Copy' })).toBeNull();
	});

	it('does not treat an expired connection on the other profile as authorized', () => {
		const audit = auditBrandChannels({
			canonicalAirtableId: CRISP_CANONICAL_AIRTABLE_ID,
			nowIso: '2026-10-04T00:00:00.000Z',
			connections: [
				{
					provider: 'linkedin',
					connectionType: 'member',
					brandProfileId: 'recrE1dZ7GkDyVZEl',
					accountName: 'Christopher Pascoe',
					expiresAt: '2026-05-25T10:20:16.963Z',
				},
				{
					provider: 'linkedin',
					connectionType: 'organization',
					brandProfileId: CRISP_RETAINED_PRODUCT_PROFILE_ID,
					accountName: 'CrisP Digital',
					expiresAt: '2026-05-25T10:20:43.972Z',
				},
			],
			metaPageName: 'Crispdigital',
			instagramUsername: 'crisp_digital',
			publicWebsite: 'https://www.crispdigital.io',
			publicXHandle: true,
		});
		expect(audit.find((row) => row.channel === 'LinkedIn')?.state).toBe('CONNECTED_BUT_UNVERIFIED');
		expect(audit.find((row) => row.channel === 'LinkedIn')?.note).toContain(CRISP_RETAINED_PRODUCT_PROFILE_ID);
		expect(audit.find((row) => row.channel === 'X')?.state).toBe('NOT_IMPLEMENTED');
		expect(audit.find((row) => row.channel === 'Blog/website')?.state).toBe('SUPPORTED_NOT_CONNECTED');
	});

	it('seeds one native brand and does not import the duplicate queue item twice', async () => {
		const store = createMemoryIntelligenceStore();
		const seeded = await activateLegacyBrand(store, {
			userId: OWNER,
			airtableTable: 'BrandProfiles',
			selectedId: CRISP_CANONICAL_AIRTABLE_ID,
			reason: CRISP_RECONCILIATION_REASON,
			profiles: [
				{ id: CRISP_CANONICAL_AIRTABLE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
				{ id: CRISP_RETAINED_PRODUCT_PROFILE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
			],
			brain: { identity: crispIdentity, voice: crispVoice, guardrails: crispGuardrails, knowledge: crispKnowledge },
			strategy: {
				status: 'active',
				objectives: ['Build authority and start qualified conversations'],
				audiences: [{ name: 'Founders without a marketing team' }],
				audienceProblems: ['No internal marketing team'],
				desiredOutcomes: ['A qualified conversation'],
				positioning: crispIdentity.positioning,
				keyMessages: ['Listed services are not case studies'],
				proofPoints: [],
				contentPillars: ['Practical AI', 'Performance marketing', 'Web experience'],
				funnelStages: ['awareness', 'consideration'],
				ctaStrategy: { default: 'Invite a conversation' },
				contentMix: { linkedin: 'primary' },
				editorialThemes: crispThemes.map((theme) => theme.title),
			},
			themes: crispThemes.map((theme) => ({
				...theme,
				relatedPillars: [...theme.relatedPillars],
				keyArguments: [...theme.keyArguments],
				questionsToAnswer: [...theme.questionsToAnswer],
				subtopics: [],
				proofPoints: [],
				keywords: ['crisp digital'],
				channels: ['linkedin'],
				status: 'active' as const,
			})),
			queueItems: [
				{ id: 'rec-post', platform: 'LinkedIn', status: 'Draft', hook: 'A stored hook', body: 'A stored body' },
				{ id: 'rec-empty', status: 'Needs Copy' },
			],
			representativeExample: { body: crispIdentity.description ?? '', whyItWorks: 'Stored overview, not a result.' },
		});
		const again = await activateLegacyBrand(store, {
			userId: OWNER,
			airtableTable: 'BrandProfiles',
			selectedId: CRISP_CANONICAL_AIRTABLE_ID,
			reason: CRISP_RECONCILIATION_REASON,
			profiles: [
				{ id: CRISP_CANONICAL_AIRTABLE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
				{ id: CRISP_RETAINED_PRODUCT_PROFILE_ID, clientName: 'CrisP Digital', ownerUserId: OWNER },
			],
			brain: { identity: crispIdentity, voice: crispVoice, guardrails: crispGuardrails, knowledge: crispKnowledge },
			strategy: {
				status: 'active',
				objectives: ['Build authority and start qualified conversations'],
				audiences: [{ name: 'Founders without a marketing team' }],
				audienceProblems: ['No internal marketing team'],
				desiredOutcomes: ['A qualified conversation'],
				positioning: crispIdentity.positioning,
				keyMessages: ['Listed services are not case studies'],
				proofPoints: [],
				contentPillars: ['Practical AI', 'Performance marketing', 'Web experience'],
				funnelStages: ['awareness', 'consideration'],
				ctaStrategy: { default: 'Invite a conversation' },
				contentMix: { linkedin: 'primary' },
				editorialThemes: crispThemes.map((theme) => theme.title),
			},
			themes: crispThemes.map((theme) => ({
				...theme,
				relatedPillars: [...theme.relatedPillars],
				keyArguments: [...theme.keyArguments],
				questionsToAnswer: [...theme.questionsToAnswer],
				subtopics: [],
				proofPoints: [],
				keywords: ['crisp digital'],
				channels: ['linkedin'],
				status: 'active' as const,
			})),
			queueItems: [{ id: 'rec-post', platform: 'LinkedIn', status: 'Draft', hook: 'A stored hook', body: 'A stored body' }],
		});
		expect(seeded.memoryIngested).toBe(1);
		expect(again.memoryIngested).toBe(0);
		expect(again.memorySkipped).toBe(1);
		expect(seeded.themeTitles).toHaveLength(5);
		const brains = await store.listBrandBrains(OWNER);
		expect(brains.map((brain) => brain.identity.name)).toEqual(['CrisP Digital']);
		expect(crispKnowledge.proofPoints).toEqual([]);
		expect(crispKnowledge.brandFacts?.some((fact) => fact.includes('research gap'))).toBe(true);
	});
});
