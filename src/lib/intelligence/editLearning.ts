export type EditSignal = {
	signalType: string;
	observation: string;
	evidence: string;
};

function words(text: string): string[] {
	return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function ngrams(tokens: string[], n: number): string[] {
	const out: string[] = [];
	for (let i = 0; i <= tokens.length - n; i += 1) {
		out.push(tokens.slice(i, i + n).join(' '));
	}
	return out;
}

function removedTokens(ai: string, user: string, n: number): string[] {
	const before = new Map<string, number>();
	for (const token of ngrams(words(ai), n)) before.set(token, (before.get(token) ?? 0) + 1);
	for (const token of ngrams(words(user), n)) {
		const count = before.get(token) ?? 0;
		if (count <= 1) before.delete(token);
		else before.set(token, count - 1);
	}
	return [...before.entries()].filter(([, count]) => count > 0).map(([token]) => token);
}

function avgSentenceLength(text: string): number {
	const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
	if (sentences.length === 0) return 0;
	return words(text).length / sentences.length;
}

export function analyseEditDiff(aiVersion: string, userVersion: string): EditSignal[] {
	if (aiVersion.trim() === userVersion.trim()) return [];
	const signals: EditSignal[] = [];
	const removedWords = removedTokens(aiVersion, userVersion, 1).filter((token) => token.length > 3);
	const removedPhrases = removedTokens(aiVersion, userVersion, 3);

	if (removedPhrases.length > 0) {
		signals.push({
			signalType: 'phrases_removed',
			observation: `User removed phrases such as: ${removedPhrases.slice(0, 5).join('; ')}`,
			evidence: removedPhrases.slice(0, 5).join(' | '),
		});
	}

	if (removedWords.filter((word) => /unlock|leverage|delve|game-changer|synergy/.test(word)).length) {
		signals.push({
			signalType: 'promotional_language_removed',
			observation: 'User stripped promotional or clichéd vocabulary from the AI draft',
			evidence: removedWords.slice(0, 8).join(', '),
		});
	}

	const aiHook = aiVersion.trim().split('\n')[0] ?? '';
	const userHook = userVersion.trim().split('\n')[0] ?? '';
	if (aiHook && userHook && aiHook !== userHook) {
		signals.push({
			signalType: 'hook_changed',
			observation: 'User rewrote the opening hook',
			evidence: `AI: ${aiHook.slice(0, 140)} → User: ${userHook.slice(0, 140)}`,
		});
	}

	const aiTail = aiVersion.trim().slice(-180);
	const userTail = userVersion.trim().slice(-180);
	if (/sign up|book a call|learn more|comment below/i.test(aiTail) && !/sign up|book a call|learn more|comment below/i.test(userTail)) {
		signals.push({
			signalType: 'cta_softened',
			observation: 'User softened or removed the closing CTA',
			evidence: userTail,
		});
	}

	const aiLen = avgSentenceLength(aiVersion);
	const userLen = avgSentenceLength(userVersion);
	if (aiLen > 0 && Math.abs(userLen - aiLen) >= 4) {
		signals.push({
			signalType: 'sentence_length_preference',
			observation: userLen < aiLen ? 'User prefers shorter sentences' : 'User prefers longer sentences',
			evidence: `AI avg ${aiLen.toFixed(1)} → user avg ${userLen.toFixed(1)}`,
		});
	}

	if ((userVersion.match(/!/g) || []).length > (aiVersion.match(/!/g) || []).length + 1) {
		signals.push({
			signalType: 'punctuation_preference',
			observation: 'User added emphasis punctuation',
			evidence: 'exclamation marks increased',
		});
	}

	if (userVersion.split('\n\n').length !== aiVersion.split('\n\n').length) {
		signals.push({
			signalType: 'structure_changed',
			observation: 'User changed paragraph structure',
			evidence: `AI paragraphs ${aiVersion.split('\n\n').length} → user ${userVersion.split('\n\n').length}`,
		});
	}

	return signals;
}

export function nextConfidence(
	current: 'candidate' | 'observed' | 'strong' | 'confirmed' | undefined,
	occurrences: number,
): 'candidate' | 'observed' | 'strong' | 'confirmed' {
	if (occurrences >= 6) return current === 'confirmed' ? 'confirmed' : 'strong';
	if (occurrences >= 3) return 'observed';
	return 'candidate';
}
