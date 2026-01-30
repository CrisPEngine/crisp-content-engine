/**
 * Content validation logic for multi-channel generation
 * 
 * Validates content against channel-specific constraints.
 * Detects common quality issues (e.g., "LinkedIn-style tweets").
 */

import type { ContentDraft, ValidationError, ValidationResult } from './types';

/**
 * LinkedIn-style patterns that should NOT appear in X content
 * These are formal, corporate phrases that signal "this was written for LinkedIn"
 */
const LINKEDIN_STYLE_PATTERNS = [
	/i'?m excited to announce/i,
	/i'?m thrilled to share/i,
	/i'?m happy to share/i,
	/here'?s what i learned/i,
	/here are my key takeaways/i,
	/if you'?re looking to/i,
	/excited to share that/i,
	/pleased to announce/i,
	/delighted to/i,
	/honored to/i,
];

/**
 * Check if text contains LinkedIn-style patterns
 */
export function hasLinkedInStylePatterns(text: string): boolean {
	return LINKEDIN_STYLE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if text has sufficient line breaks for skimmability (X requirement)
 */
export function hasSkimmableStructure(text: string): boolean {
	const lines = text.split('\n').filter((line) => line.trim().length > 0);
	const avgLineLength = text.length / Math.max(lines.length, 1);
	
	// Must have at least 2 line breaks (3+ lines) and average line length <= 60 chars
	return lines.length >= 3 && avgLineLength <= 60;
}

/**
 * Validate X single tweet
 */
export function validateXSingle(draft: ContentDraft): ValidationResult {
	const errors: ValidationError[] = [];
	const text = draft.post_content || '';
	const charCount = text.length;

	// Hard constraint: <= 280 chars
	if (charCount > 280) {
		errors.push({
			code: 'X_OVER_LIMIT',
			message: `Tweet is ${charCount} characters (max 280)`,
			severity: 'block',
			canAutoRewrite: true,
		});
	}

	// Soft constraint: must be skimmable
	if (!hasSkimmableStructure(text) && charCount > 100) {
		errors.push({
			code: 'X_NOT_SKIMMABLE',
			message: 'Tweet needs more line breaks for readability',
			severity: 'warn',
			canAutoRewrite: true,
		});
	}

	// Detect LinkedIn-style patterns
	if (hasLinkedInStylePatterns(text)) {
		errors.push({
			code: 'X_LINKEDIN_STYLE',
			message: 'Tweet contains LinkedIn-style formal language',
			severity: 'block',
			canAutoRewrite: true,
		});
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return { ok: true };
}

/**
 * Validate X thread
 */
export function validateXThread(draft: ContentDraft): ValidationResult {
	const errors: ValidationError[] = [];
	const text = draft.post_content || '';
	const charCount = text.length;

	// Each tweet in a thread must also be <= 280
	if (charCount > 280) {
		errors.push({
			code: 'X_THREAD_TWEET_OVER_LIMIT',
			message: `Tweet ${draft.thread_index || '?'} is ${charCount} characters (max 280)`,
			severity: 'block',
			canAutoRewrite: true,
		});
	}

	// Detect LinkedIn-style patterns
	if (hasLinkedInStylePatterns(text)) {
		errors.push({
			code: 'X_THREAD_LINKEDIN_STYLE',
			message: `Tweet ${draft.thread_index || '?'} contains LinkedIn-style formal language`,
			severity: 'block',
			canAutoRewrite: true,
		});
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return { ok: true };
}

/**
 * Validate Meta caption (Instagram/Facebook)
 */
export function validateMetaCaption(draft: ContentDraft): ValidationResult {
	const errors: ValidationError[] = [];
	const text = draft.post_content || '';

	// Check for wall-of-text (avoid single giant paragraph)
	const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0);
	const maxParagraphLength = Math.max(...paragraphs.map((p) => p.length));

	if (maxParagraphLength > 400) {
		errors.push({
			code: 'META_WALL_OF_TEXT',
			message: 'Caption has a paragraph longer than 400 characters (break it up)',
			severity: 'warn',
		});
	}

	// Check hashtag count (if hashtags provided)
	if (draft.hashtags) {
		const hashtagCount = (draft.hashtags.match(/#/g) || []).length;
		if (hashtagCount > 15) {
			errors.push({
				code: 'META_TOO_MANY_HASHTAGS',
				message: `${hashtagCount} hashtags (recommended 5–15)`,
				severity: 'warn',
			});
		}
	}

	if (errors.some((e) => e.severity === 'block')) {
		return { ok: false, errors };
	}

	// Allow warnings but still pass
	return { ok: true };
}

/**
 * Validate LinkedIn post
 */
export function validateLinkedInSingle(draft: ContentDraft): ValidationResult {
	const errors: ValidationError[] = [];
	const text = draft.post_content || '';

	// Check if it's too short (tweet-like)
	if (text.length < 50 && text.length > 0) {
		errors.push({
			code: 'LINKEDIN_TOO_SHORT',
			message: 'Post is very short (consider expanding for LinkedIn)',
			severity: 'warn',
		});
	}

	// LinkedIn posts can be long; no upper limit
	return { ok: true };
}

/**
 * Validate Blog post
 */
export function validateBlogPost(draft: ContentDraft): ValidationResult {
	// Minimal validation for Blog (copy/export focus)
	// Could add word count checks, structure validation, etc. in future
	return { ok: true };
}
