import 'server-only';

import { getIntelligenceStore } from '../actions';

/** Records an editorial rejection as a proposed learning. It does not become a rule until accepted. */
export async function proposeEditorialLearning(userId: string, brandBrainId: string, observation: string): Promise<void> {
	const text = observation.trim();
	if (text.length < 12) return;
	const store = getIntelligenceStore();
	const signalType = `editorial:${text.slice(0, 80).toLowerCase()}`;
	const existing = await store.listEditLearnings(userId, brandBrainId);
	const match = existing.find((row) => row.signalType === signalType);
	await store.saveEditLearning(userId, {
		id: match?.id,
		brandBrainId,
		signalType,
		observation: text.slice(0, 500),
		confidence: 'candidate',
		status: match?.status === 'accepted' || match?.status === 'rejected' || match?.status === 'disabled' ? match.status : 'proposed',
		occurrenceCount: (match?.occurrenceCount ?? 0) + 1,
	});
}
