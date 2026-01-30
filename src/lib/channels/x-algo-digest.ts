/**
 * X (Twitter) Algorithm Digest
 * 
 * Curated summary of X's ranking algorithm for content generation.
 * This digest is included in generation prompts to guide X-native output.
 * 
 * Version history:
 * - 2026-01-21: Initial digest based on public X ranking algorithm
 * 
 * Update policy:
 * - Only update when you intentionally want output behavior to shift
 * - Keep under ~1,200 tokens
 * - Human-review all changes
 */

export const X_ALGO_DIGEST = {
	version: '2026-01-21',
	bullets: [
		'Engagement signals matter most: replies, retweets, likes (in that order)',
		'Recency is critical: fresh content ranks higher',
		'Author reputation: blue check, follower count, and engagement history boost visibility',
		'Negative signals: blocks, mutes, reports, "show less" actions hurt reach',
		'External links slightly reduce in-feed visibility (but still valuable)',
		'Media (images, videos) increase engagement when relevant',
		'Threads keep users on-platform longer (positive signal)',
		'Reply quality > reply quantity: substantive replies rank higher',
		'Avoid spam patterns: repetitive text, excessive hashtags, bot-like behavior',
		'First hour performance predicts long-term reach',
		'Authentic voice and controversial takes drive replies',
		'Hook in first line determines scroll-stop rate',
		'Line breaks and whitespace improve readability and engagement',
		'Questions and strong opinions generate more replies than neutral statements',
		'Timing matters: post when your audience is active',
	],
	guardrails: {
		do: [
			'Hook in the first line (first 140 chars decide whether users engage)',
			'Use line breaks for skimmability',
			'Be opinionated and clear',
			'Ask questions or make bold claims to drive replies',
			'Keep tweets focused on one idea',
		],
		dont: [
			'Use LinkedIn-style formal language ("I\'m excited to announce", "Here\'s what I learned")',
			'Write wall-of-text paragraphs',
			'Overuse hashtags (1–2 max, often zero)',
			'Be vague or neutral (takes no position = no engagement)',
			'Ignore the 280 character limit',
		],
	},
};

/**
 * Format digest for inclusion in prompts (compact version)
 */
export function getXAlgoDigestForPrompt(): string {
	const bulletList = X_ALGO_DIGEST.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
	const doList = X_ALGO_DIGEST.guardrails.do.map((d) => `✓ ${d}`).join('\n');
	const dontList = X_ALGO_DIGEST.guardrails.dont.map((d) => `✗ ${d}`).join('\n');
	
	return `X Algorithm Digest (${X_ALGO_DIGEST.version}):

Ranking factors:
${bulletList}

Do:
${doList}

Don't:
${dontList}`;
}
