import 'server-only';

import { syncNativeSocialForUser } from './nativeSync';

const lastSyncByUser = new Map<string, number>();
const SYNC_TTL_MS = 30_000;

export async function syncNativeSocialForUserThrottled(userId: string, force = false): Promise<void> {
	if (!force) {
		const last = lastSyncByUser.get(userId) ?? 0;
		if (Date.now() - last < SYNC_TTL_MS) return;
	}
	lastSyncByUser.set(userId, Date.now());
	await syncNativeSocialForUser(userId);
}
