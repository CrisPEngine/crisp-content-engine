import { describe, expect, it } from 'vitest';
import { buildScheduleProposal } from '../scheduleProposal';
import type { BrandBrain, PerformanceSnapshot } from '../types';

const brain: BrandBrain = {
	id: 'brain-1',
	userId: 'user-1',
	airtableBrandId: 'rec-brand',
	identity: { name: 'Folian' },
	voice: {},
	guardrails: {},
	knowledge: { brandFacts: ['Timezone: Asia/Dubai'] },
	examples: [],
	updatedAt: new Date().toISOString(),
};

describe('buildScheduleProposal', () => {
	it('labels thin history as an experimental test slot', () => {
		const proposal = buildScheduleProposal({
			brain,
			strategy: {
				id: 's1',
				userId: 'user-1',
				brandBrainId: 'brain-1',
				airtableBrandId: 'rec-brand',
				status: 'active',
				objectives: [],
				audiences: [],
				audienceProblems: [],
				desiredOutcomes: [],
				keyMessages: [],
				proofPoints: [],
				contentPillars: [],
				funnelStages: [],
				ctaStrategy: {},
				contentMix: {},
				editorialThemes: [],
				campaigns: [],
				channelStrategies: [{ id: 'c1', strategyId: 's1', channel: 'instagram', cadence: '4x week', formats: [], constraints: [] }],
			},
			channel: 'instagram',
			snapshots: [],
			now: new Date('2026-10-19T12:00:00.000Z'),
		});
		expect(proposal.kind).toBe('experimental_test');
		expect(proposal.humanLabel).toMatch(/GST/);
		expect(proposal.note.toLowerCase()).toContain('experimental');
	});

	it('uses performance windows when enough hour buckets exist', () => {
		const snapshots: Array<PerformanceSnapshot & { brandBrainId: string }> = [];
		for (let i = 0; i < 12; i += 1) {
			const hour = i < 6 ? '15' : '19';
			snapshots.push({
				id: `p-${i}`,
				brandBrainId: 'brain-1',
				memoryId: `m-${i}`,
				channel: 'instagram',
				collectedAt: `2026-09-${String(10 + (i % 5)).padStart(2, '0')}T${hour}:30:00.000Z`,
				engagementRate: hour === '19' ? 0.08 : 0.02,
				normalised: {},
			});
		}
		const proposal = buildScheduleProposal({
			brain,
			strategy: null,
			channel: 'instagram',
			snapshots,
			now: new Date('2026-10-19T12:00:00.000Z'),
		});
		expect(proposal.sufficientHistory).toBe(true);
		expect(proposal.kind).toBe('performance_window');
	});
});
