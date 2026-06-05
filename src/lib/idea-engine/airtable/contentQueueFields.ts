/**
 * Maps Idea Engine items to Airtable ContentQueue fields.
 * Matches the Make.com content-generation field contract.
 */

export type IdeaEngineItemForQueue = {
	channel: string;
	post_title?: string | null;
	hook?: string | null;
	body_draft?: string | null;
	hashtags?: string | null;
	image_prompt?: string | null;
	scheduled_time?: string | null;
	series_position?: number | null;
};

export type ContentQueueFieldInput = {
	item: IdeaEngineItemForQueue;
	brandProfileId?: string | null;
	clientName?: string | null;
	airtableStatus: string;
	scheduledTime?: string | null;
};

/** Default queue status for Idea Engine items awaiting human review. */
export const IDEA_ENGINE_QUEUE_STATUS = 'Needs Approval';

export function resolveIdeaEngineHook(item: IdeaEngineItemForQueue): string {
	return (item.hook || item.post_title || '').trim();
}

export function buildContentQueueCoreFields(input: ContentQueueFieldInput): Record<string, unknown> {
	const hook = resolveIdeaEngineHook(input.item);
	const fields: Record<string, unknown> = {
		hook,
		post_content: input.item.body_draft || '',
		platform: input.item.channel,
		status: input.airtableStatus,
		generated_from: 'idea_engine',
	};

	if (input.clientName?.trim()) {
		fields.client_name = input.clientName.trim();
	}
	if (input.item.image_prompt) {
		fields.image_prompt = input.item.image_prompt;
	}
	if (input.item.hashtags) {
		fields.hashtags = input.item.hashtags;
	}
	if (input.brandProfileId) {
		fields.brand_profile_id = [input.brandProfileId];
	}

	const scheduledTime = input.scheduledTime ?? input.item.scheduled_time;
	if (scheduledTime) {
		fields.scheduled_time = scheduledTime;
		if (input.airtableStatus === 'Ready To Publish') {
			fields.approved_at = new Date().toISOString();
		}
	}

	return fields;
}
