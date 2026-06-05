import { describe, expect, it } from 'vitest';
import {
	buildContentQueueCoreFields,
	IDEA_ENGINE_QUEUE_STATUS,
	resolveIdeaEngineHook,
} from '../airtable/contentQueueFields';

describe('resolveIdeaEngineHook', () => {
	it('prefers hook over post_title', () => {
		expect(resolveIdeaEngineHook({ channel: 'LinkedIn', hook: 'Hook', post_title: 'Title' })).toBe(
			'Hook',
		);
	});

	it('falls back to post_title when hook is missing', () => {
		expect(resolveIdeaEngineHook({ channel: 'X', post_title: 'Title only' })).toBe('Title only');
	});
});

describe('buildContentQueueCoreFields', () => {
	it('maps Idea Engine item fields to ContentQueue contract', () => {
		const fields = buildContentQueueCoreFields({
			item: {
				channel: 'LinkedIn',
				post_title: 'Series headline',
				body_draft: 'Post body text',
				hashtags: '#growth',
				image_prompt: '{"objective":{"primary_intent":"stop scroll"}}',
				scheduled_time: '2026-06-10T09:00:00.000Z',
			},
			brandProfileId: 'recBrand123',
			clientName: 'CrisP Digital',
			airtableStatus: IDEA_ENGINE_QUEUE_STATUS,
			scheduledTime: '2026-06-10T09:00:00.000Z',
		});

		expect(fields).toMatchObject({
			client_name: 'CrisP Digital',
			platform: 'LinkedIn',
			hook: 'Series headline',
			post_content: 'Post body text',
			hashtags: '#growth',
			image_prompt: '{"objective":{"primary_intent":"stop scroll"}}',
			scheduled_time: '2026-06-10T09:00:00.000Z',
			status: 'Needs Approval',
			generated_from: 'idea_engine',
			brand_profile_id: ['recBrand123'],
		});
	});

	it('sets approved_at only for Ready To Publish with schedule', () => {
		const fields = buildContentQueueCoreFields({
			item: {
				channel: 'LinkedIn',
				post_title: 'Auto publish',
				body_draft: 'Body',
			},
			airtableStatus: 'Ready To Publish',
			scheduledTime: '2026-06-10T09:00:00.000Z',
		});

		expect(fields.status).toBe('Ready To Publish');
		expect(fields.approved_at).toBeTruthy();
	});
});
