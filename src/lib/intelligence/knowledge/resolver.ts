import type { BrandBrain, BrandStrategy, UserEditLearning } from '../types';
import type { ProductCapability } from '@/lib/articles/productKnowledge';
import { capabilitiesFromKnowledge, capabilityGuidance, usableCapabilities } from '@/lib/articles/productKnowledge';
import { capabilitiesToProductRecords } from './repository';
import type { KnowledgeSnapshot, StoredCapability } from './types';

export type IntelligenceTask = 'article' | 'brief' | 'revision' | 'seo' | 'image' | 'social' | 'publish';

export type ResolvedIntelligence = {
	brandId: string;
	brandName: string;
	retrievedAt: string;
	strategyId: string | null;
	strategyStatus: string | null;
	objectives: string[];
	pillars: string[];
	positioning?: string;
	verified: ProductCapability[];
	unverified: ProductCapability[];
	planned: ProductCapability[];
	approvedClaims: Array<{ id: string; text: string }>;
	prohibitedClaims: string[];
	learnings: Array<{ id: string; observation: string }>;
	capabilityIds: string[];
	claimIds: string[];
	learningIds: string[];
	gaps: string[];
	prompt: string;
};

function tokens(value: string): Set<string> {
	return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
}

function relevant(items: ProductCapability[], topic: string): ProductCapability[] {
	const wanted = tokens(topic);
	if (!wanted.size) return items.slice(0, 8);
	const matched = items.filter((item) => {
		const have = tokens(`${item.name} ${item.description}`);
		let shared = 0;
		for (const word of wanted) if (have.has(word)) shared += 1;
		return shared >= 1;
	});
	return (matched.length ? matched : items).slice(0, 8);
}

function fromStored(rows: StoredCapability[]): ProductCapability[] {
	return capabilitiesToProductRecords(rows);
}

export function resolveIntelligence(input: {
	brain: BrandBrain;
	strategy: BrandStrategy | null;
	snapshot: KnowledgeSnapshot | null;
	learnings: UserEditLearning[];
	topic: string;
	task: IntelligenceTask;
}): ResolvedIntelligence {
	const stored = input.snapshot?.available ? fromStored(input.snapshot.capabilities) : [];
	const catalogue = stored.length ? stored : capabilitiesFromKnowledge(input.brain.knowledge);
	const verified = usableCapabilities(catalogue);
	const planned = catalogue.filter((item) => item.availability === 'planned' || item.availability === 'in_development');
	const unverified = catalogue.filter((item) => !verified.includes(item) && !planned.includes(item));
	const scopedVerified = relevant(verified, input.topic);
	const scopedUnverified = relevant(unverified, input.topic);
	const scopedPlanned = relevant(planned, input.topic);
	const approvedClaims = (input.snapshot?.claims ?? [])
		.filter((claim) => claim.approvalStatus === 'approved' && claim.verificationStatus === 'verified' && !claim.prohibited)
		.map((claim) => ({ id: claim.id, text: claim.approvedWording || claim.claimText }));
	const prohibited = [
		...(input.brain.guardrails.prohibitedClaims ?? []),
		...(input.snapshot?.claims ?? []).filter((claim) => claim.prohibited).map((claim) => claim.claimText),
		...catalogue.flatMap((item) => item.prohibitedClaims ?? []),
	].filter(Boolean);
	const learnings = input.learnings
		.filter((item) => item.status === 'accepted')
		.slice(0, 8)
		.map((item) => ({ id: item.id, observation: item.observation }));
	const gaps = [
		...scopedUnverified.map((item) => `${item.name} is not verified.`),
		...scopedPlanned.map((item) => `${item.name} is ${item.availability.replace(/_/g, ' ')}.`),
	];
	if (!scopedVerified.length) gaps.unshift('No verified product capability matches this task.');
	const positioning = input.strategy?.positioning || input.brain.identity.positioning;
	const lines = [
		`Brand: ${input.brain.identity.name}.`,
		positioning ? `Positioning, for context only: ${positioning}` : '',
		input.strategy ? `Strategy ${input.strategy.status}. Objectives: ${input.strategy.objectives.slice(0, 3).join('; ') || 'none stored'}.` : 'No native strategy is stored.',
		capabilityGuidance([...scopedVerified, ...scopedUnverified, ...scopedPlanned]),
		approvedClaims.length ? `Approved claims: ${approvedClaims.map((claim) => claim.text).join(' ')}` : 'No approved verified claims.',
		prohibited.length ? `Do not state: ${[...new Set(prohibited)].slice(0, 8).join(' ')}` : '',
		learnings.length ? `Approved learnings: ${learnings.map((item) => item.observation).join(' ')}` : 'No approved editorial learnings.',
		'Do not mention Brand Brain, supplied material, or editorial recommendations in reader-facing prose.',
		input.task === 'image' ? 'Use this only to avoid depicting a capability that is not verified.' : '',
	].filter(Boolean);
	return {
		brandId: input.brain.id,
		brandName: input.brain.identity.name,
		retrievedAt: new Date().toISOString(),
		strategyId: input.strategy?.id ?? null,
		strategyStatus: input.strategy?.status ?? null,
		objectives: input.strategy?.objectives ?? [],
		pillars: input.strategy?.contentPillars ?? [],
		positioning,
		verified: scopedVerified,
		unverified: scopedUnverified,
		planned: scopedPlanned,
		approvedClaims,
		prohibitedClaims: [...new Set(prohibited)],
		learnings,
		capabilityIds: [...scopedVerified, ...scopedUnverified, ...scopedPlanned].map((item) => item.id),
		claimIds: approvedClaims.map((claim) => claim.id),
		learningIds: learnings.map((item) => item.id),
		gaps,
		prompt: lines.join('\n'),
	};
}

export function intelligenceManifest(intelligence: ResolvedIntelligence) {
	return {
		retrievedAt: intelligence.retrievedAt,
		brandId: intelligence.brandId,
		strategyId: intelligence.strategyId,
		strategyStatus: intelligence.strategyStatus,
		capabilityIds: intelligence.capabilityIds,
		claimIds: intelligence.claimIds,
		learningIds: intelligence.learningIds,
		verifiedNames: intelligence.verified.map((item) => item.name),
	};
}

export function publicationBlocks(body: string, intelligence: ResolvedIntelligence): string[] {
	const text = body.toLowerCase();
	return intelligence.prohibitedClaims.filter((claim) => claim.trim().length > 12 && text.includes(claim.trim().toLowerCase()));
}
