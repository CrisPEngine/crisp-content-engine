export const CAPABILITY_AVAILABILITY = ['available', 'beta', 'private_preview', 'in_development', 'planned', 'deprecated', 'unverified'] as const;

export type CapabilityAvailability = (typeof CAPABILITY_AVAILABILITY)[number];

export type ProductCapability = {
	id: string;
	name: string;
	description: string;
	availability: CapabilityAvailability;
	platform?: string;
	evidence?: string;
	lastVerified?: string | null;
	limitations?: string;
	approvedLanguage?: string;
	prohibitedClaims?: string[];
	productUrl?: string;
	/** Separate from availability. Absent on records saved before verification existed. */
	verificationStatus?: 'verified' | 'unverified' | 'verification_required' | 'evidence_outdated' | 'disputed';
};

export type KnowledgeGap = {
	id: string;
	question: string;
	status: 'unverified' | 'unavailable' | 'not_yet_available';
	note: string;
};

const USABLE = new Set<CapabilityAvailability>(['available', 'beta']);

export function capabilitiesFromKnowledge(input: { capabilities?: ProductCapability[]; productFacts?: string[] }): ProductCapability[] {
	if (input.capabilities?.length) return input.capabilities;
	return (input.productFacts ?? []).filter(Boolean).map((fact, index) => ({
		id: `unverified-fact-${index + 1}`,
		name: fact.slice(0, 80),
		description: fact,
		availability: 'unverified' as const,
	}));
}

export function usableCapabilities(capabilities: ProductCapability[]): ProductCapability[] {
	return capabilities.filter((item) => {
		if (!USABLE.has(item.availability) || !item.evidence?.trim() || !item.lastVerified) return false;
		if (item.verificationStatus && item.verificationStatus !== 'verified') return false;
		return true;
	});
}

/** A capability may be described as currently available only when it is available or beta and has evidence. */
export function capabilityGuidance(capabilities: ProductCapability[]): string {
	const usable = usableCapabilities(capabilities);
	const withheld = capabilities.filter((item) => !usable.includes(item));
	const lines = [
		usable.length
			? `Verified capabilities that may be stated as current: ${usable.map((item) => `${item.name} (${item.availability})${item.approvedLanguage ? `: ${item.approvedLanguage}` : ''}`).join('; ')}.`
			: 'No product capability is verified. Do not describe product features as currently available.',
	];
	if (withheld.length) {
		lines.push(
			`Do not describe these as currently available: ${withheld.map((item) => `${item.name} [${item.availability}]`).join('; ')}.`,
		);
	}
	return lines.join('\n');
}

function tokens(value: string): Set<string> {
	return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
}

export function detectKnowledgeGaps(questions: string[], capabilities: ProductCapability[], brandName?: string | null): KnowledgeGap[] {
	const gaps: KnowledgeGap[] = [];
	const brand = brandName?.trim().toLowerCase();
	questions.forEach((question, index) => {
		const lower = question.toLowerCase();
		const aboutProduct = (brand && lower.includes(brand)) || /\b(software|product|feature|app|tool)\b/.test(lower);
		if (!aboutProduct) return;
		const questionTokens = tokens(question);
		const match = capabilities.find((item) => {
			const name = tokens(`${item.name} ${item.description}`);
			let shared = 0;
			for (const word of questionTokens) if (name.has(word)) shared += 1;
			return shared >= 2;
		});
		if (match && USABLE.has(match.availability) && match.evidence && match.lastVerified) return;
		const status = match?.availability === 'planned' || match?.availability === 'in_development' ? 'not_yet_available' : match?.availability === 'deprecated' ? 'unavailable' : 'unverified';
		gaps.push({
			id: `gap-${index + 1}`,
			question,
			status,
			note: match
				? `${match.name} is ${match.availability.replace(/_/g, ' ')}. Do not describe it as currently available.`
				: 'No verified product capability answers this. Leave it as a knowledge gap.',
		});
	});
	return gaps;
}
