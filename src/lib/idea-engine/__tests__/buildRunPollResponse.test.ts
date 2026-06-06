import { describe, expect, it } from 'vitest';
import { buildRunPollResponse } from '../persistence/buildRunPollResponse';

describe('buildRunPollResponse', () => {
	const baseRun = {
		id: 'run-1',
		series_run_id: 'series-1',
		idea: 'Test idea',
		goal: null,
		selected_channels: ['X'],
		publish_mode: 'queue_only',
		status: 'generating',
		total_expected: 3,
		total_generated: 0,
		error: null,
		generation_warning: null,
		generation_stage: 'generating_x',
		created_at: new Date().toISOString(),
	};

	it('includes item counts and stage label', () => {
		const payload = buildRunPollResponse(baseRun, [
			{
				id: 'i1',
				channel: 'X',
				post_title: null,
				body_draft: null,
				image_prompt: null,
				hashtags: null,
				series_position: 1,
				series_total: 3,
				status: 'generating',
			},
			{
				id: 'i2',
				channel: 'X',
				post_title: 'Post',
				body_draft: 'Body',
				image_prompt: null,
				hashtags: null,
				series_position: 2,
				series_total: 3,
				status: 'ready',
			},
			{
				id: 'i3',
				channel: 'X',
				post_title: null,
				body_draft: null,
				image_prompt: null,
				hashtags: null,
				series_position: 3,
				series_total: 3,
				status: 'failed',
			},
		]);

		expect(payload.item_counts).toEqual({
			ready: 1,
			failed: 1,
			generating: 1,
			confirmed: 0,
		});
		expect(payload.run.generation_stage_label).toContain('X');
		expect(payload.run.last_error).toBeNull();
	});

	it('maps failed run status to failed stage', () => {
		const payload = buildRunPollResponse(
			{ ...baseRun, status: 'failed', error: 'Timed out', generation_stage: null },
			[],
		);
		expect(payload.run.generation_stage).toBe('failed');
		expect(payload.run.last_error).toBe('Timed out');
	});
});
