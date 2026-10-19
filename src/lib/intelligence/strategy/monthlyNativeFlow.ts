import 'server-only';

import { dispatchStrategyGenerationWorker, enqueueNativeStrategyGeneration } from './generationJob';

export type MonthlyNativeInput = {
	ownerUserId: string;
	airtableBrandId: string;
	briefOrUpdateId: string;
	objective?: string;
	themesFocus?: string;
	keyDates?: string;
	feedbackNotes?: string;
	contentPreferences?: string;
	cycleLabel?: string;
	source: 'monthly_brief' | 'monthly_update';
};

export async function enqueueMonthlyNativeStrategy(input: MonthlyNativeInput): Promise<string> {
	const instructions = [
		'Monthly strategy refresh. Produce a full native strategy draft.',
		input.cycleLabel ? `Cycle: ${input.cycleLabel}` : '',
		input.objective ? `Objective: ${input.objective}` : '',
		input.themesFocus ? `Priority themes: ${input.themesFocus}` : '',
		input.keyDates ? `Key dates: ${input.keyDates}` : '',
		input.feedbackNotes ? `Feedback: ${input.feedbackNotes}` : '',
		input.contentPreferences ? `Content preferences: ${input.contentPreferences}` : '',
		`Reference Airtable record id: ${input.briefOrUpdateId} (mirror only, do not copy verbatim).`,
	]
		.filter(Boolean)
		.join('\n');

	const job = await enqueueNativeStrategyGeneration({
		ownerUserId: input.ownerUserId,
		airtableBrandId: input.airtableBrandId,
		instructions,
		escalate: true,
		source: input.source,
	});

	await dispatchStrategyGenerationWorker(job.id).catch((err) => {
		console.error('[Monthly native] strategy worker dispatch failed:', err);
	});

	return job.id;
}

export async function patchAirtableBriefStatus(input: {
	recordId: string;
	status: string;
	nativeJobId?: string;
}): Promise<void> {
	const token = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;
	const tableId = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;
	if (!token || !baseId || !tableId) return;
	const fields: Record<string, unknown> = { status: input.status };
	if (input.nativeJobId) {
		fields.strategy_meta = JSON.stringify({ nativeStrategyJobId: input.nativeJobId, engine: 'native' });
	}
	await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${input.recordId}`, {
		method: 'PATCH',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields }),
	}).catch((err) => console.warn('[Monthly native] Airtable status patch failed:', err));
}
