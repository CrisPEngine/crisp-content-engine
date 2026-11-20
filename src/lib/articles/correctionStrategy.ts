export type CorrectionKind = 'example_conflict' | 'introduction' | 'closing' | 'indirect_answer' | 'repetition' | 'unsupported_claim' | 'continuity';

export type CorrectionDecision = 'continue' | 'retry' | 'stop';

const STRATEGIES: Record<string, { kind: CorrectionKind; instruction: string }> = {
	'example-conflict': { kind: 'example_conflict', instruction: 'Keep one cast, setting and timeline. Change only the conflicting names. Do not rewrite the article.' },
	'intro-weak': { kind: 'introduction', instruction: 'Replace only the opening so it states the reader problem and what the guide will do.' },
	'opening-guide': { kind: 'introduction', instruction: 'Replace only the opening so it defines the problem before the method.' },
	'cta-weak': { kind: 'closing', instruction: 'Change only the closing section so it states the next practical check. Do not add an unverified product claim.' },
	'answers-indirect': { kind: 'indirect_answer', instruction: 'Answer the article’s own reader question in the relevant section. Do not add a FAQ or change unrelated sections.' },
	'repetition': { kind: 'repetition', instruction: 'Remove only the repeated sentence. Keep the first useful statement.' },
	'unsupported-claim': { kind: 'unsupported_claim', instruction: 'Remove the claim that is not in the approved research. Do not replace it with a new claim.' },
	'continuity-inconsistency': { kind: 'continuity', instruction: 'Align the conflicting story fact with the earlier passage. Do not invent a new event.' },
};

export function correctionStrategy(findingId: string): { kind: CorrectionKind; instruction: string } | null {
	return STRATEGIES[findingId] ?? null;
}

export function correctionDecision(input: {
	openBlockers: string[];
	attemptsByFinding: Record<string, number>;
	maxAttempts: number;
	costUsd: number;
	maxCostUsd: number;
	introducedCritical: boolean;
	unverifiable: boolean;
}): { decision: CorrectionDecision; reason: string } {
	if (input.costUsd >= input.maxCostUsd) return { decision: 'stop', reason: 'The article budget is used. A person needs to review it.' };
	if (input.unverifiable) return { decision: 'stop', reason: 'A product claim or factual check could not be verified. It was not retried.' };
	if (input.introducedCritical) return { decision: 'stop', reason: 'A correction introduced a new serious problem. A person needs to review it.' };
	if (!input.openBlockers.length) return { decision: 'continue', reason: 'The open publication findings are resolved. Production can continue. Nothing was published.' };
	const exhausted = input.openBlockers.filter((id) => (input.attemptsByFinding[id] ?? 0) >= input.maxAttempts);
	if (exhausted.length === input.openBlockers.length) {
		return { decision: 'stop', reason: `The correction limit is used for ${exhausted.join(', ')}. A person needs to review the remaining findings.` };
	}
	return { decision: 'retry', reason: `Another targeted attempt remains for ${input.openBlockers.filter((id) => !exhausted.includes(id)).join(', ')}.` };
}
