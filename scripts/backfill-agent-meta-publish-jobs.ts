/**
 * Backfill publish_jobs for agent Instagram/Facebook content that is scheduled
 * but missing a queued job (e.g. approved before Meta agent queue sync existed).
 *
 * Usage:
 *   npx tsx scripts/backfill-agent-meta-publish-jobs.ts [--dry-run] [--user-id=UUID]
 */
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getSupabaseService } from '@/lib/supabaseService';
import {
	agentMetaPlatformFromChannel,
	isAgentMetaMemory,
	syncAgentMetaPublishJob,
} from '@/lib/publish/agentMetaJob';

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const userFilter = process.argv.find((a) => a.startsWith('--user-id='))?.split('=')[1];

	const admin = getSupabaseService();
	let query = admin
		.from('content_memory')
		.select('id, user_id, channel, publication_status, publication_date, brand_brain_id')
		.eq('publication_status', 'scheduled');
	if (userFilter) query = query.eq('user_id', userFilter);
	const { data: rows, error } = await query;
	if (error) throw new Error(error.message);

	const store = getIntelligenceStore();
	let repaired = 0;
	let skipped = 0;

	for (const row of rows ?? []) {
		if (!isAgentMetaMemory({ channel: row.channel })) {
			skipped++;
			continue;
		}
		const platform = agentMetaPlatformFromChannel(row.channel);
		if (!platform) continue;

		const { data: job } = await admin
			.from('publish_jobs')
			.select('id, status')
			.eq('user_id', row.user_id)
			.eq('platform', platform)
			.eq('content_item_key', row.id)
			.in('status', ['queued', 'retrying', 'publishing', 'published'])
			.maybeSingle();

		if (job) {
			skipped++;
			continue;
		}

		const memory = await store.getMemory(row.user_id, row.id);
		if (!memory) continue;

		console.log(`${dryRun ? '[dry-run] would queue' : 'queue'} ${platform} job for memory ${row.id} user ${row.user_id}`);
		if (!dryRun) {
			await syncAgentMetaPublishJob({
				userId: row.user_id,
				memory,
				publishAt: row.publication_date ?? undefined,
			});
		}
		repaired++;
	}

	console.log(JSON.stringify({ repaired, skipped, dryRun }, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
