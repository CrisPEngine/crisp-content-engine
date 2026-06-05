import 'server-only';

/**
 * ContentQueue field IDs (immutable) and API field names for Idea Engine queries.
 * Field names are used in fields[] and sort[] params; IDs are used to read responses
 * when returnFieldsByFieldId=true.
 */
export const IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS = {
	platform: 'fldY4TjWWgthnDiw4',
	status: 'fldYU7HnycHcwrUFH',
	hook: 'fldVPEPwwoyfEmjIn',
	post_content: 'fldxVHLUkrlcxx7Ua',
	created_time: 'fldumyzHN5hyImgti',
	brand_profile_id: 'fldqCh274V2Ih2PPS',
} as const;

export const IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES = {
	platform: 'platform',
	status: 'status',
	hook: 'hook',
	post_content: 'post_content',
	created_time: 'created_time',
	brand_profile_id: 'brand_profile_id',
} as const;

export const IDEA_ENGINE_HISTORY_WARNING =
	'Content history could not be loaded. Generation continued without deduplication.';

export const IDEA_ENGINE_GENERATION_FAILED_MESSAGE =
	'Content generation failed. Please try again.';

type AirtableRecord = {
	fields?: Record<string, unknown>;
	createdTime?: string;
};

export function readContentQueueField(
	record: AirtableRecord,
	field: keyof typeof IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS,
): string {
	const fields = record.fields || {};
	const byId = fields[IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS[field]];
	if (typeof byId === 'string') return byId;
	const byName = fields[IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES[field]];
	if (typeof byName === 'string') return byName;
	if (field === 'created_time' && record.createdTime) return record.createdTime;
	return '';
}

export function mapContentHistoryRecord(record: AirtableRecord): Record<string, unknown> {
	const hook = readContentQueueField(record, 'hook');
	const platform = readContentQueueField(record, 'platform');
	const postContent = readContentQueueField(record, 'post_content');
	const status = readContentQueueField(record, 'status');
	const createdTime = readContentQueueField(record, 'created_time');

	return {
		platform,
		hook,
		post_title: hook,
		'Post Title': hook,
		'Post Content': postContent,
		post_content: postContent,
		status,
		created_time: createdTime,
	};
}
