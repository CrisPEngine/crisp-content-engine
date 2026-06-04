import 'server-only';

/**
 * Coerce OpenAI json_object output before strict Zod validation.
 * Does not log or retain prompt/content.
 */
export function normalizeDraftLlmPayload(raw: unknown): Record<string, unknown> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}

	const o = raw as Record<string, unknown>;
	const fitRaw = o.fitScore;
	let fitScore = 5;
	if (typeof fitRaw === 'number' && Number.isFinite(fitRaw)) {
		fitScore = Math.min(10, Math.max(1, Math.round(fitRaw)));
	} else if (typeof fitRaw === 'string') {
		const n = Number.parseInt(fitRaw, 10);
		if (Number.isFinite(n)) fitScore = Math.min(10, Math.max(1, n));
	}

	const tags = o.suggestedTags;
	const suggestedTags = Array.isArray(tags)
		? tags.map((t) => String(t).trim()).filter(Boolean)
		: [];

	let suggestedContentIdea: Record<string, string> | undefined;
	if (o.suggestedContentIdea && typeof o.suggestedContentIdea === 'object' && !Array.isArray(o.suggestedContentIdea)) {
		const idea = o.suggestedContentIdea as Record<string, unknown>;
		suggestedContentIdea = {
			title: String(idea.title ?? '').trim(),
			hook: String(idea.hook ?? '').trim(),
			angle: String(idea.angle ?? '').trim(),
			topicBucket: String(idea.topicBucket ?? idea.topic_bucket ?? '').trim(),
		};
	}

	const base: Record<string, unknown> = {
		draftText: String(o.draftText ?? o.draft_text ?? '').trim(),
		shortAlternative: String(o.shortAlternative ?? o.short_alternative ?? '').trim(),
		fitScore,
		opportunitySummary: String(o.opportunitySummary ?? o.opportunity_summary ?? '').trim(),
		recommendedAction: String(o.recommendedAction ?? o.recommended_action ?? '').trim(),
		ctaRecommendation: String(o.ctaRecommendation ?? o.cta_recommendation ?? '').trim(),
		linkRecommendation: String(o.linkRecommendation ?? o.link_recommendation ?? '').trim(),
		riskNotes: String(o.riskNotes ?? o.risk_notes ?? '').trim(),
		suggestedFollowUp: String(o.suggestedFollowUp ?? o.suggested_follow_up ?? '').trim(),
		suggestedTags,
	};

	if (
		suggestedContentIdea &&
		(suggestedContentIdea.title || suggestedContentIdea.hook || suggestedContentIdea.angle)
	) {
		base.suggestedContentIdea = suggestedContentIdea;
	}

	return base;
}
