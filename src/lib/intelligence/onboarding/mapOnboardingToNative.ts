import type { BrandGuardrails, BrandIdentity, BrandKnowledge, BrandVoice, FunnelStage } from '../types';

export type OnboardingNativeInput = {
	brandType: 'company' | 'personal';
	clientName: string;
	website?: string;
	audience: string;
	valueProps: string;
	offers: string;
	brandGoals: string;
	voiceRules?: string;
	brandKeywords?: string;
	excludeKeywords?: string;
	contentRules?: string;
	additionalInfo?: string;
	platformsRequested: string[];
	timezone: string;
	languageRegion: string;
	preferredImageSource: string;
	brandPalette?: string;
	approvalContactEmail?: string;
	personalVoiceTraits?: string[];
	personalToneAvoid?: string[];
	personalRiskTolerance?: string;
	personalContentStyle?: string[];
	personalExcludeKeywords?: string;
};

function platformKey(label: string): string {
	const normalized = label.trim().toLowerCase();
	if (normalized === 'x') return 'x';
	if (normalized === 'blog') return 'blog';
	if (normalized === 'linkedin') return 'linkedin';
	if (normalized === 'instagram') return 'instagram';
	if (normalized === 'facebook') return 'facebook';
	return normalized.replace(/\s+/g, '_');
}

export function mapOnboardingToNative(input: OnboardingNativeInput): {
	identity: BrandIdentity;
	voice: BrandVoice;
	guardrails: BrandGuardrails;
	knowledge: BrandKnowledge;
	strategy: {
		status: 'draft';
		objectives: string[];
		audiences: Array<{ name: string; description?: string }>;
		audienceProblems: string[];
		desiredOutcomes: string[];
		positioning?: string;
		keyMessages: string[];
		proofPoints: string[];
		contentPillars: string[];
		funnelStages: FunnelStage[];
		ctaStrategy: Record<string, unknown>;
		contentMix: Record<string, unknown>;
		editorialThemes: string[];
	};
} {
	const name = input.clientName.trim() || 'Brand';
	const voiceTraits = input.personalVoiceTraits?.length ? input.personalVoiceTraits.join(', ') : undefined;
	const tone =
		input.voiceRules?.trim() ||
		voiceTraits ||
		(input.brandType === 'personal' ? 'Professional and authentic' : 'Clear and helpful');

	const identity: BrandIdentity = {
		name,
		website: input.website?.trim() || undefined,
		description: input.audience?.trim() || undefined,
		purpose: input.brandGoals?.trim() || undefined,
		positioning: input.valueProps?.trim() || undefined,
		productsServices: input.offers?.trim() ? [input.offers.trim()] : undefined,
		audiences: input.audience?.trim() ? [input.audience.trim()] : undefined,
	};

	const voice: BrandVoice = {
		tone,
		personality: voiceTraits,
		formality: input.languageRegion,
		vocabularyPreferences: input.brandKeywords?.trim() || undefined,
		formattingPreferences: input.personalContentStyle?.length ? input.personalContentStyle.join('; ') : undefined,
	};

	const avoidPhrases = [
		...(input.excludeKeywords?.trim() ? input.excludeKeywords.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) : []),
		...(input.personalExcludeKeywords?.trim() ? input.personalExcludeKeywords.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) : []),
		...(input.personalToneAvoid ?? []),
	];

	const guardrails: BrandGuardrails = {
		phrasesToAvoid: avoidPhrases.length ? avoidPhrases : undefined,
		styleRestrictions: input.contentRules?.trim() ? [input.contentRules.trim()] : undefined,
		promotionalIntensity: input.personalRiskTolerance?.toLowerCase().includes('low') ? 'low' : 'medium',
	};

	const facts: string[] = [];
	if (input.offers?.trim()) facts.push(`Offers: ${input.offers.trim()}`);
	if (input.brandPalette?.trim()) facts.push(`Brand palette: ${input.brandPalette.trim()}`);
	if (input.timezone) facts.push(`Timezone: ${input.timezone}`);
	if (input.approvalContactEmail?.trim()) facts.push(`Approval contact: ${input.approvalContactEmail.trim()}`);
	if (input.additionalInfo?.trim()) facts.push(input.additionalInfo.trim());

	const knowledge: BrandKnowledge = {
		brandFacts: facts.length ? facts : undefined,
		referenceInformation: input.preferredImageSource ? [`Preferred image source: ${input.preferredImageSource}`] : undefined,
	};

	const contentMix: Record<string, unknown> = {};
	for (const platform of input.platformsRequested) {
		contentMix[platformKey(platform)] = 'requested';
	}

	const objectives = input.brandGoals?.trim() ? [input.brandGoals.trim()] : ['Grow brand visibility and engagement'];
	const positioning = input.valueProps?.trim() || undefined;

	return {
		identity,
		voice,
		guardrails,
		knowledge,
		strategy: {
			status: 'draft',
			objectives,
			audiences: input.audience?.trim() ? [{ name: 'Primary audience', description: input.audience.trim() }] : [],
			audienceProblems: [],
			desiredOutcomes: objectives,
			positioning,
			keyMessages: positioning ? [positioning] : [],
			proofPoints: [],
			contentPillars: input.platformsRequested.length ? input.platformsRequested.map((p) => `${p} content`) : ['Core brand story'],
			funnelStages: ['awareness', 'consideration'] as FunnelStage[],
			ctaStrategy: { default: 'Invite a relevant next step without inventing offers or urgency.' },
			contentMix,
			editorialThemes: [],
		},
	};
}
