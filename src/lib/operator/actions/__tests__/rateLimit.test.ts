import { describe, expect, it } from 'vitest';
import { enforceOperatorRateLimit } from '../rateLimit';
import type { OperatorActor } from '../logger';

describe('operator rate limits', () => {
	it('skips buckets for admin UI sessions', async () => {
		const actor: OperatorActor = {
			type: 'admin_session',
			id: 'admin-user',
			email: 'admin@example.com',
			scopes: ['fetch_brand_content_queue'],
		};
		await expect(
			enforceOperatorRateLimit({ action: 'generate_content_batch', actor, sourceIp: '127.0.0.1' }),
		).resolves.toBeDefined();
	});
});
