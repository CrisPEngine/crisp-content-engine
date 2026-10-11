import { describe, expect, it } from 'vitest';
import { redditSubmitUrl, RedditChannel } from '../reddit';
import { validateRedditPost } from '../validators';

describe('Reddit channel validation', () => {
	it('blocks titles over 300 characters', () => {
		const result = RedditChannel.validate({
			platform: 'reddit',
			post_type: 'single',
			hook: 't'.repeat(301),
			post_content: 'Body',
			reddit: { subreddit: 'startups' },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.some((error) => error.code === 'REDDIT_TITLE_TOO_LONG')).toBe(true);
		}
	});

	it('requires subreddit and title', () => {
		const result = validateRedditPost({
			platform: 'reddit',
			post_type: 'single',
			hook: '',
			post_content: '',
			reddit: {},
		});
		expect(result.ok).toBe(false);
	});

	it('builds submit URL with title query param', () => {
		expect(redditSubmitUrl('startups', 'Hello world')).toBe(
			'https://www.reddit.com/r/startups/submit?title=Hello+world',
		);
	});
});
