/**
 * Generate a full human-readable strategy summary from the complete AI strategy JSON.
 * Supports both camelCase/snake_case and Make/OpenAI bundle field names so the full
 * strategy is surfaced on the strategy page and used for content creation.
 */

const get = (obj: any, ...keys: string[]): any => {
	if (!obj) return undefined;
	for (const key of keys) {
		const v = obj[key];
		if (v !== undefined && v !== null && v !== '') return v;
	}
	return undefined;
};

const toArr = (v: any): any[] => (Array.isArray(v) ? v : []);

export function generateStrategySummary(strategy: any): string {
	if (!strategy || typeof strategy !== 'object') return '';

	const lines: string[] = [];

	// Brand Summary (one_liner / One liner, positioning / Positioning)
	const brandSummary = strategy.brand_summary || strategy.Brand_summary || {};
	const oneLiner = get(brandSummary, 'one_liner', 'One liner');
	const positioning = get(brandSummary, 'positioning', 'Positioning');
	if (oneLiner) lines.push(`📌 ${oneLiner}`);
	if (positioning) lines.push(`\n${positioning}`);

	// Brand Understanding (summary, tone_description, visual_impression, perceived_audience)
	const brandUnderstanding = strategy.brand_understanding || strategy.Brand_understanding || {};
	const buSummary = get(brandUnderstanding, 'summary', 'Summary');
	const perceivedAudience = get(brandUnderstanding, 'perceived_audience', 'Perceived audience');
	const toneDesc = get(brandUnderstanding, 'tone_description', 'Tone description');
	const visualImpression = get(brandUnderstanding, 'visual_impression', 'Visual impression');
	if (buSummary || perceivedAudience || toneDesc || visualImpression) {
		lines.push(`\n\n## Brand Understanding`);
		if (buSummary) lines.push(`\n${buSummary}`);
		if (perceivedAudience) lines.push(`\n**Target Audience:** ${perceivedAudience}`);
		if (toneDesc) lines.push(`\n**Tone:** ${toneDesc}`);
		if (visualImpression) lines.push(`\n**Visual impression:** ${visualImpression}`);
	}

	// Content Pillars (name, why, content_formats, example_hooks)
	const pillars = toArr(strategy.pillars || strategy.Pillars);
	if (pillars.length > 0) {
		lines.push(`\n\n## Content Pillars`);
		pillars.forEach((pillar: any, index: number) => {
			const name = get(pillar, 'name', 'Name');
			const why = get(pillar, 'why', 'Why');
			const formats = toArr(pillar.content_formats).filter(Boolean);
			const hooks = toArr(pillar.example_hooks).filter(Boolean);
			if (name) {
				lines.push(`\n${index + 1}. **${name}**`);
				if (why) lines.push(`   ${why}`);
				if (formats.length > 0) lines.push(`   **Formats:** ${formats.join(', ')}`);
				if (hooks.length > 0) {
					hooks.forEach((h: string) => lines.push(`   - ${h}`));
				}
			}
		});
	}

	// Posting Cadence (LinkedIn, X, etc.)
	const cadence = strategy.cadence || strategy.Cadence || {};
	if (Object.keys(cadence).length > 0) {
		lines.push(`\n\n## Posting Schedule`);
		Object.entries(cadence).forEach(([platform, frequency]) => {
			if (frequency && String(frequency).trim()) {
				lines.push(`- **${platform}:** ${frequency}`);
			}
		});
	}

	// Content Mix (thought_leadership_pct, educational_pct, promo_pct, community_pct)
	const postMix = strategy.post_mix || strategy.Post_mix || {};
	const tl = get(postMix, 'thought_leadership_pct', 'Thought leadership pct');
	const edu = get(postMix, 'educational_pct', 'Educational pct');
	const promo = get(postMix, 'promo_pct', 'Promo pct');
	const comm = get(postMix, 'community_pct', 'Community pct');
	if (tl !== undefined || edu !== undefined || promo !== undefined || comm !== undefined) {
		lines.push(`\n\n## Content Mix`);
		if (tl !== undefined) lines.push(`- Thought leadership: ${tl}%`);
		if (edu !== undefined) lines.push(`- Educational: ${edu}%`);
		if (promo !== undefined) lines.push(`- Promo: ${promo}%`);
		if (comm !== undefined) lines.push(`- Community: ${comm}%`);
	}

	// Voice (Summary, Dos, Donts)
	const voice = strategy.voice || strategy.Voice || {};
	const voiceSummary = get(voice, 'summary', 'Summary');
	const dos = toArr(voice.dos || voice.Dos);
	const donts = toArr(voice.donts || voice.Donts);
	if (voiceSummary || dos.length > 0 || donts.length > 0) {
		lines.push(`\n\n## Voice`);
		if (voiceSummary) lines.push(`\n${voiceSummary}`);
		if (dos.length > 0) {
			lines.push(`\n**Do:**`);
			dos.forEach((d: string) => lines.push(`- ${d}`));
		}
		if (donts.length > 0) {
			lines.push(`\n**Don't:**`);
			donts.forEach((d: string) => lines.push(`- ${d}`));
		}
	}

	// Hashtag buckets (LinkedIn, X, Instagram, etc.)
	const hashtagBuckets = strategy.hashtag_buckets || strategy.Hashtag_buckets || {};
	if (typeof hashtagBuckets === 'object' && Object.keys(hashtagBuckets).length > 0) {
		lines.push(`\n\n## Hashtag Buckets`);
		Object.entries(hashtagBuckets).forEach(([platform, tags]) => {
			const list = Array.isArray(tags) ? tags : (typeof tags === 'string' ? [tags] : []);
			if (list.length > 0) {
				lines.push(`\n**${platform}:** ${list.join(', ')}`);
			}
		});
	}

	// Image direction
	const imageDir = strategy.image_direction || strategy.Image_direction || {};
	const styleNotes = get(imageDir, 'style_notes', 'Style notes');
	const sourcePref = get(imageDir, 'source_preference', 'Source preference');
	if (styleNotes || sourcePref) {
		lines.push(`\n\n## Image Direction`);
		if (styleNotes) lines.push(`- **Style:** ${styleNotes}`);
		if (sourcePref) lines.push(`- **Source:** ${sourcePref}`);
	}

	// Schedule windows
	const scheduleWindows = strategy.schedule_windows || strategy.Schedule_windows || {};
	const swNotes = get(scheduleWindows, 'notes', 'Notes');
	if (swNotes) {
		lines.push(`\n\n## Schedule Windows`);
		lines.push(swNotes);
	}

	// KPIs (primary, secondary, objective_alignment)
	const kpis = strategy.kpis || strategy.Kpis || {};
	const primary = get(kpis, 'primary', 'Primary');
	const secondary = get(kpis, 'secondary', 'Secondary');
	const objectiveAlign = get(kpis, 'objective_alignment', 'objective_alignment');
	if (primary || secondary || objectiveAlign) {
		lines.push(`\n\n## Key Performance Indicators`);
		if (primary) lines.push(`- **Primary:** ${primary}`);
		if (secondary) lines.push(`- **Secondary:** ${secondary}`);
		if (objectiveAlign) lines.push(`\n**Objective alignment:** ${objectiveAlign}`);
	}

	// Guardrails (avoid_topics, include_keywords, exclude_keywords, platforms_requested)
	const guardrails = strategy.guardrails || strategy.Guardrails || {};
	const avoidTopics = toArr(guardrails.avoid_topics || guardrails.Avoid_topics).filter(Boolean);
	const includeKw = toArr(guardrails.include_keywords || guardrails.Include_keywords).filter(Boolean);
	const excludeKw = toArr(guardrails.exclude_keywords || guardrails.Exclude_keywords).filter(Boolean);
	const platformsReq = toArr(guardrails.platforms_requested || strategy.platforms_requested).filter(Boolean);
	if (avoidTopics.length > 0 || includeKw.length > 0 || excludeKw.length > 0 || platformsReq.length > 0) {
		lines.push(`\n\n## Guardrails`);
		if (avoidTopics.length > 0) lines.push(`- **Avoid topics:** ${avoidTopics.join(', ')}`);
		if (includeKw.length > 0) lines.push(`- **Include keywords:** ${includeKw.join(', ')}`);
		if (excludeKw.length > 0) lines.push(`- **Exclude keywords:** ${excludeKw.join(', ')}`);
		if (platformsReq.length > 0) lines.push(`- **Platforms:** ${platformsReq.join(', ')}`);
	}

	// Automation flags
	const automationFlags = strategy.automation_flags || strategy.Automation_flags || {};
	const seasonal = automationFlags.seasonal_allowed ?? automationFlags.Seasonal_allowed;
	const variations = get(automationFlags, 'variations_per_concept', 'Variations per concept');
	const videoEnabled = automationFlags.video_enabled ?? automationFlags.Video_enabled;
	const videoAlloc = get(automationFlags, 'video_allocation', 'Video allocation');
	if (seasonal !== undefined || variations !== undefined || videoEnabled !== undefined || videoAlloc !== undefined) {
		lines.push(`\n\n## Automation`);
		if (seasonal !== undefined) lines.push(`- Seasonal allowed: ${seasonal}`);
		if (variations !== undefined) lines.push(`- Variations per concept: ${variations}`);
		if (videoEnabled !== undefined) lines.push(`- Video enabled: ${videoEnabled}`);
		if (videoAlloc !== undefined) lines.push(`- Video allocation: ${videoAlloc}`);
	}

	return lines.join('\n').trim();
}
