import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchDepthForDecision } from '@/lib/research/policy';
import { selectSearchProvider, tavilySearchProvider } from '@/lib/research/search';

describe('search providers', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('defaults to Tavily and maps classifier decisions to search depth', () => {
		vi.stubEnv('RESEARCH_SEARCH_PROVIDER', 'tavily');
		vi.stubEnv('TAVILY_API_KEY', 'tvly-test');
		expect(selectSearchProvider().name).toBe('tavily');
		expect(selectSearchProvider().configured).toBe(true);
		expect(searchDepthForDecision('QUICK_VERIFY')).toBe('basic');
		expect(searchDepthForDecision('FULL_RESEARCH')).toBe('advanced');
		expect(searchDepthForDecision('REFRESH_EXISTING_RESEARCH')).toBe('advanced');
	});

	it('calls Tavily with basic or advanced search_depth', async () => {
		const bodies: Array<Record<string, unknown>> = [];
		const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(JSON.stringify({ results: [{ url: 'https://example.com/a', title: 'A', content: 'Snippet A' }] }), { status: 200 });
		}) as typeof fetch;
		const provider = tavilySearchProvider(fetchImpl, 'tvly-test');
		await provider.search('ChatGPT ads UAE', 4, { depth: 'basic' });
		await provider.search('ChatGPT ads UAE', 4, { depth: 'advanced' });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(bodies[0]?.search_depth).toBe('basic');
		expect(bodies[1]?.search_depth).toBe('advanced');
		expect(bodies[0]?.include_answer).toBe(false);
	});

	it('keeps Brave available behind RESEARCH_SEARCH_PROVIDER=brave', () => {
		vi.stubEnv('RESEARCH_SEARCH_PROVIDER', 'brave');
		vi.stubEnv('BRAVE_SEARCH_API_KEY', 'brave-test');
		const provider = selectSearchProvider();
		expect(provider.name).toBe('brave');
		expect(provider.configured).toBe(true);
	});
});
