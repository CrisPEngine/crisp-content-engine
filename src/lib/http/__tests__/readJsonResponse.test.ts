import { describe, expect, it } from 'vitest';
import { defaultHttpMessage, readJsonResponse } from '../readJsonResponse';

describe('readJsonResponse', () => {
	it('parses JSON error bodies', async () => {
		const response = new Response(JSON.stringify({ error: 'No file provided' }), {
			status: 400,
			headers: { 'content-type': 'application/json' },
		});
		const parsed = await readJsonResponse<{ error?: string }>(response);
		expect(parsed.ok).toBe(false);
		expect(parsed.errorMessage).toBe('No file provided');
	});

	it('returns a readable message for non-JSON 413 responses', async () => {
		const response = new Response('Request Entity Too Large', { status: 413 });
		const parsed = await readJsonResponse<{ error?: string }>(response);
		expect(parsed.data).toBeNull();
		expect(parsed.errorMessage).toBe(defaultHttpMessage(413));
	});
});
