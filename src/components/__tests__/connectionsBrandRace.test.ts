import { describe, expect, it } from 'vitest';
import { isCurrentBrandResponse } from '@/components/ConnectionsExperience';

describe('Connections brand switching', () => {
	it('rejects stale responses during Folian → CrisP → Folian → CrisP switching', () => {
		const folian = 'folian';
		const crisp = 'crisp';
		const accepted: string[] = [];
		const apply = (requestId: number, currentRequestId: number, responseBrand: string, currentBrand: string) => {
			if (isCurrentBrandResponse(requestId, currentRequestId, responseBrand, currentBrand)) {
				accepted.push(responseBrand);
			}
		};

		// F → C: the late Folian response cannot render beneath CrisP.
		apply(1, 2, folian, crisp);
		// C → F: the late CrisP response cannot render beneath Folian.
		apply(2, 3, crisp, folian);
		// F → C: only the final CrisP response may render.
		apply(3, 4, folian, crisp);
		apply(4, 4, crisp, crisp);

		expect(accepted).toEqual([crisp]);
	});
});
