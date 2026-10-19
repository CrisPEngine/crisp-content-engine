import 'server-only';

import { NextResponse } from 'next/server';
import { isLegacyMakeEnabled } from '@/lib/featureFlags';

export { isLegacyMakeEnabled };

export function legacyMakeDisabledResponse(nextAction?: { message: string; href?: string; code?: string }) {
	return NextResponse.json(
		{
			error:
				nextAction?.message ??
				'Legacy Make.com automation is disabled. Use native Intelligence and content generation instead.',
			code: nextAction?.code ?? 'legacy_make_disabled',
			next_action_href: nextAction?.href ?? '/intelligence',
			legacy_flag: 'LEGACY_MAKE_ENABLED',
		},
		{ status: 503 },
	);
}

export function assertLegacyMakeEnabled(): void {
	if (!isLegacyMakeEnabled()) {
		throw new Error('LEGACY_MAKE_DISABLED');
	}
}
