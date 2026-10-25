import { describe, expect, it } from 'vitest';
import {
	composeAgentPublishText,
	dedupeCtaFromBody,
	parseSocialProductionDraft,
	sanitizeSocialPublishFields,
} from '../socialPublishBody';

describe('parseSocialProductionDraft', () => {
	it('keeps only the caption section for Instagram-style production drafts', () => {
		const raw = `VISUAL CONCEPT
A split scene showing a timeline drift.

CAROUSEL COPY
Panel 1: Hook line on screen one.
Panel 2: The payoff on screen two.

CAPTION
You moved a scene. Did the calendar move with it?

Most drafts treat time like a label, not a dependency.

How do you track time in your draft?

#Folian #Writing`;

		const parsed = parseSocialProductionDraft(raw);
		expect(parsed.hadProductionSections).toBe(true);
		expect(parsed.visualBrief).toContain('split scene');
		expect(parsed.carouselCopy).toContain('Panel 1');
		expect(parsed.publishableBody).toContain('You moved a scene');
		expect(parsed.publishableBody).not.toContain('VISUAL CONCEPT');
		expect(parsed.publishableBody).not.toContain('Panel 1');
	});

	it('extracts image prompt blocks into visual brief material', () => {
		const raw = `IMAGE PROMPT
Minimal desk scene, warm light, no text overlay.

CAPTION
Ship the caption only.`;
		const parsed = parseSocialProductionDraft(raw);
		expect(parsed.visualBrief).toContain('Minimal desk scene');
		expect(parsed.publishableBody).toBe('Ship the caption only.');
	});
});

describe('dedupeCtaFromBody', () => {
	it('removes a trailing CTA that matches the separate CTA field', () => {
		const body = 'Main copy here.\n\nHow do you track time in your draft?';
		expect(dedupeCtaFromBody(body, 'How do you track time in your draft?')).toBe('Main copy here.');
	});

	it('leaves body unchanged when CTA is not duplicated', () => {
		const body = 'Main copy here.';
		expect(dedupeCtaFromBody(body, 'Different question?')).toBe(body);
	});
});

describe('sanitizeSocialPublishFields', () => {
	it('stores visual brief in metadata.image_prompt and enforces Instagram limit', () => {
		const longCaption = `${'Word '.repeat(550)}How do you track time in your draft?`;
		const raw = `VISUAL CONCEPT
Concept text.

CAPTION
${longCaption}`;
		const result = sanitizeSocialPublishFields({
			channel: 'instagram',
			body: raw,
			cta: 'How do you track time in your draft?',
			metadata: {},
		});
		expect(result.body.length).toBeLessThanOrEqual(2200);
		expect(result.body).not.toContain('Concept text');
		expect(result.metadata.image_prompt).toContain('Concept text');
		expect(result.body).not.toMatch(/How do you track time in your draft\?\s*$/);
		expect(result.cta).toBe('How do you track time in your draft?');
	});
});

describe('truncateToChannelLimit via sanitize', () => {
	it('shortens Threads copy at a sentence boundary instead of mid-word', () => {
		const body = `${'Detail about canon and continuity. '.repeat(8)}How do you track time? #Folian trailing filler words.`;
		const result = sanitizeSocialPublishFields({
			channel: 'threads',
			body,
			metadata: {},
		});
		expect(result.body.length).toBeLessThanOrEqual(500);
		expect(result.body).toMatch(/\?\s*#Folian/);
	});
});

describe('composeAgentPublishText', () => {
	it('keeps the full Threads body including the closing question', () => {
		expect(
			composeAgentPublishText({
				channel: 'threads',
				body: 'Main copy.\n\nHow do you track time? #Folian',
				cta: 'How do you track time?',
			}),
		).toContain('How do you track time?');
	});
	it('does not append CTA when body already ends with the same question', () => {
		expect(
			composeAgentPublishText({
				body: 'Caption copy.\n\nHow do you track time in your draft?',
				cta: 'How do you track time in your draft?',
			}),
		).toBe('Caption copy.');
	});
});
