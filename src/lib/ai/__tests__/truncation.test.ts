import { describe, expect, it } from 'vitest';
import {
	countWords,
	isLongFormGeneration,
	isOutputTruncated,
	looksTruncatedMidSentence,
	parseWordCountRangeFromText,
	resolveLongFormWordRange,
	wordCountInRange,
} from '../truncation';

describe('truncation detection', () => {
	it('detects token-limit finish reasons', () => {
		expect(isOutputTruncated({ text: 'Complete sentence.', finishReason: 'length' })).toBe(true);
		expect(isOutputTruncated({ text: 'Complete sentence.', incompleteReason: 'max_output_tokens' })).toBe(true);
	});

	it('detects mid-sentence endings', () => {
		const truncated =
			'This paragraph makes a clear point and then keeps going until it stops without finishing the last thought about canon and';
		expect(looksTruncatedMidSentence(truncated)).toBe(true);
		expect(looksTruncatedMidSentence('This ends cleanly.')).toBe(false);
	});

	it('parses word ranges from instructions', () => {
		expect(parseWordCountRangeFromText('Write a 900-1200 word LinkedIn post')).toEqual({ min: 900, max: 1200 });
		expect(resolveLongFormWordRange({ channel: 'linkedin', userIntent: 'long-form post' })).toEqual({ min: 900, max: 1400 });
	});

	it('flags long-form generation intent', () => {
		expect(isLongFormGeneration({ channel: 'linkedin', userIntent: '900-1200 word essay' })).toBe(true);
		expect(isLongFormGeneration({ channel: 'linkedin', userIntent: 'short hook post' })).toBe(false);
	});

	it('checks word count ranges', () => {
		const text = Array.from({ length: 950 }, () => 'word').join(' ');
		expect(wordCountInRange(text, { min: 900, max: 1200 })).toBe(true);
		expect(countWords(text)).toBe(950);
	});
});
