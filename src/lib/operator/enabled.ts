import 'server-only';

import { isOperatorConsoleEnabled } from '@/lib/featureFlags';
import { OperatorActionError } from './actions/errors';

export function assertOperatorConsoleEnabled(): void {
	if (!isOperatorConsoleEnabled()) {
		throw new OperatorActionError('Not found', {
			status: 404,
			code: 'not_found',
		});
	}
}
