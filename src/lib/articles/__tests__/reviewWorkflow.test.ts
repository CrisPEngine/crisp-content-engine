import { describe, expect, it } from 'vitest';
import { acceptanceLabel, reviewPrimary } from '@/lib/articles/reviewWorkflow';

describe('review workflow', () => {
	const base = { hasCritique: true, reviewStale: false, accepted: 0, hasPreview: false, justApplied: false, blockingOpen: 2 };

	it('keeps acceptance separate from application', () => {
		expect(acceptanceLabel('accepted')).toBe('Approved, awaiting application');
		expect(acceptanceLabel('applied')).toBe('Applied to the draft');
		expect(reviewPrimary({ ...base, accepted: 4 }).label).toBe('Preview 4 Approved Changes');
		expect(reviewPrimary({ ...base, accepted: 1 }).label).toBe('Preview 1 Approved Change');
		expect(reviewPrimary({ ...base, hasCritique: false, accepted: 2 }).action).toBe('preview');
		expect(reviewPrimary({ ...base, accepted: 4, hasPreview: true }).action).toBe('apply');
		expect(reviewPrimary({ ...base, accepted: 4, hasPreview: true }).label).toBe('Confirm new revision');
	});

	it('asks for a new critique when the draft moved on, and shows the draft after apply', () => {
		expect(reviewPrimary({ ...base, reviewStale: true }).label).toBe('Run Editorial Pass of Draft');
		expect(reviewPrimary({ ...base, reviewStale: true, accepted: 4 }).label).toBe('Preview 4 Approved Changes');
		expect(reviewPrimary({ ...base, justApplied: true }).action).toBe('draft');
		expect(reviewPrimary({ ...base, hasCritique: false }).action).toBe('critique');
		expect(reviewPrimary({ ...base, blockingOpen: 0 }).action).toBe('images');
	});
});