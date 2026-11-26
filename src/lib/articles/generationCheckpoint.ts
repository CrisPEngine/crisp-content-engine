export type GenerationSectionCheckpoint = {
	id: string;
	heading: string;
	status: 'complete' | 'failed';
	body: string;
	attempts: number;
	error: string | null;
	model: string | null;
	updatedAt: string;
};

export type GenerationOutlineItem = {
	id: string;
	heading: string;
	purpose: string;
	targetWords: number;
};

export type GenerationCheckpoint = {
	jobId: string | null;
	outline: GenerationOutlineItem[];
	sections: GenerationSectionCheckpoint[];
	updatedAt: string;
};

/** Joins a continuation without repeating the overlap already present at the end of the draft. */
export function appendContinuation(previous: string, piece: string): string {
	const base = previous.trim();
	const next = piece.trim();
	if (!base) return next;
	if (!next) return base;
	const window = base.slice(-400);
	const limit = Math.min(window.length, next.length);
	for (let size = limit; size >= 40; size -= 1) {
		const suffix = window.slice(-size);
		if (next.startsWith(suffix)) return `${base}${next.slice(size)}`.replace(/\n{3,}/g, '\n\n').trim();
	}
	return `${base}\n\n${next}`.trim();
}

/** Output budget for one section. The role maximum is a ceiling, not the budget for every section. */
export function sectionOutputBudget(targetWords: number, roleMaxTokens: number): number {
	const words = Number.isFinite(targetWords) && targetWords > 0 ? targetWords : 180;
	const budget = Math.round(words * 8 + 1200);
	return Math.max(800, Math.min(roleMaxTokens, budget));
}

export function canResumeGeneration(body: string | null | undefined, checkpoint: GenerationCheckpoint | null | undefined): GenerationCheckpoint | null {
	if (body?.trim()) return null;
	const saved = completedSectionMap(checkpoint);
	return saved.size > 0 && checkpoint ? checkpoint : null;
}

export function completedSectionMap(checkpoint: GenerationCheckpoint | null | undefined): Map<string, GenerationSectionCheckpoint> {
	const saved = new Map<string, GenerationSectionCheckpoint>();
	for (const section of checkpoint?.sections ?? []) {
		if (section.status === 'complete' && section.body.trim()) saved.set(section.id, section);
	}
	return saved;
}

export function generationPausedMessage(checkpoint: GenerationCheckpoint | null | undefined, fallback: string): string {
	const done = checkpoint?.sections.filter((section) => section.status === 'complete' && section.body.trim()).length ?? 0;
	const total = checkpoint?.outline.length ?? 0;
	if (done > 0 && total > 0) {
		return `Generation paused. ${done} of ${total} sections are saved. Resume generation to continue.`;
	}
	if (/truncated by the model/i.test(fallback)) {
		return 'A section was interrupted before it could be finished. Resume generation to continue from the last saved section.';
	}
	return fallback;
}
