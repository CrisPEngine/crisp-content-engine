import 'server-only';

import { isSidecarApiEnabled } from '@/lib/featureFlags';
import { SidecarError } from './errors';

export function assertSidecarApiEnabled(): void {
	if (!isSidecarApiEnabled()) {
		throw new SidecarError('Sidecar is not enabled', {
			status: 404,
			code: 'sidecar_disabled',
		});
	}
}
