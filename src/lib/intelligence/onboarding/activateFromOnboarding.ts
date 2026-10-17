import type { IntelligenceStore } from '../store';
import { assertCanAddBrand } from '@/lib/brandLimits';
import { activateLegacyBrand } from '../legacy/activate';
import { mapOnboardingToNative, type OnboardingNativeInput } from './mapOnboardingToNative';

export async function activateBrandFromOnboarding(input: {
	store: IntelligenceStore;
	userId: string;
	airtableTable: string;
	airtableBrandId: string;
	clientName: string;
	onboarding: OnboardingNativeInput;
	reason?: string;
}): Promise<{ brandId: string; strategyId: string; airtableBrandId: string }> {
	await assertCanAddBrand(input.userId, { forAirtableBrandId: input.airtableBrandId });
	const mapped = mapOnboardingToNative(input.onboarding);
	const activated = await activateLegacyBrand(input.store, {
		userId: input.userId,
		airtableTable: input.airtableTable,
		profiles: [{ id: input.airtableBrandId, clientName: input.clientName, ownerUserId: input.userId }],
		selectedId: input.airtableBrandId,
		reason: input.reason ?? 'onboarding',
		brain: {
			identity: mapped.identity,
			voice: mapped.voice,
			guardrails: mapped.guardrails,
			knowledge: mapped.knowledge,
		},
		strategy: mapped.strategy,
		themes: [],
	});

	return {
		brandId: activated.brandId,
		strategyId: activated.strategyId,
		airtableBrandId: activated.airtableBrandId,
	};
}
