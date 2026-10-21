import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { findPublishJobForContent, isQueueablePublishJobStatus } from '@/lib/publish/publishJobActive';
import { publishInstantsMatch, toPublishInstantIso } from '@/lib/publish/publishInstant';

export async function realignQueuedPublishJobToPublicationDate(input: {
	userId: string;
	contentItemKey: string;
	platform: string;
	publicationDate: string;
}): Promise<{ realigned: boolean; scheduledTime?: string; reason?: string }> {
	const targetIso = toPublishInstantIso(input.publicationDate);
	if (!targetIso) return { realigned: false, reason: 'invalid_publication_date' };

	const job = await findPublishJobForContent({
		userId: input.userId,
		contentItemKey: input.contentItemKey,
		platform: input.platform,
	});
	if (!job || !isQueueablePublishJobStatus(job.status)) {
		return { realigned: false, reason: 'no_queueable_job' };
	}
	if (publishInstantsMatch(job.scheduled_time, targetIso)) {
		return { realigned: false, scheduledTime: job.scheduled_time };
	}

	const admin = getSupabaseService();
	const { error } = await admin
		.from('publish_jobs')
		.update({
			scheduled_time: targetIso,
			next_attempt_at: null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', job.id)
		.in('status', ['queued', 'retrying']);

	if (error) {
		return { realigned: false, reason: error.message };
	}
	return { realigned: true, scheduledTime: targetIso };
}
