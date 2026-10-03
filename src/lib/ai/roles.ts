/**
 * Central model-role catalog.
 * Application code requests a role. This file resolves provider, model, and reasoning effort.
 *
 * Precedence:
 * 1. AI_MODEL_<ROLE> — explicit registry override
 * 2. Catalog default (GPT-6 family)
 * 3. Legacy IDEA_ENGINE_LLM_MODEL / SIDECAR_LLM_MODEL only when AI_LEGACY_MODEL_OVERRIDES=true
 *
 * Production still has IDEA_ENGINE_LLM_MODEL=gpt-4o and SIDECAR_LLM_MODEL=gpt-4o-mini.
 * Those values are ignored unless the migration flag is set, so they cannot silently
 * replace the registry after this catalog is deployed.
 */

import type { ReasoningEffort } from '@/lib/llm/modelAdapter';

export const MODEL_ROLES = [
	'FAST',
	'EXTRACTION',
	'CLASSIFICATION',
	'WRITING',
	'STRATEGY',
	'RESEARCH',
	'REVIEW',
	'SIDECAR',
	'DEEP_STRATEGY',
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export type ModelRoleConfig = {
	role: ModelRole;
	provider: 'openai';
	preferred: string;
	fallbacks: string[];
	reasoningEffort: ReasoningEffort;
	/** Used only by the chat-completions adapter. GPT-6 requests omit temperature. */
	temperature: number;
	maxTokens: number;
	timeoutMs: number;
	description: string;
};

const LUNA = 'gpt-6-luna';
const SOL = 'gpt-6.1-sol';
const ASTRA = 'gpt-6-astra';

const ROLE_DEFAULTS: Record<ModelRole, Omit<ModelRoleConfig, 'role' | 'provider'>> = {
	FAST: {
		preferred: LUNA,
		fallbacks: [],
		reasoningEffort: 'none',
		temperature: 0,
		maxTokens: 1024,
		timeoutMs: 30_000,
		description: 'High-volume tagging, routing, and short transforms',
	},
	EXTRACTION: {
		preferred: LUNA,
		fallbacks: [],
		reasoningEffort: 'none',
		temperature: 0,
		maxTokens: 2048,
		timeoutMs: 45_000,
		description: 'Structured extraction from existing text',
	},
	CLASSIFICATION: {
		preferred: LUNA,
		fallbacks: [],
		reasoningEffort: 'none',
		temperature: 0,
		maxTokens: 1024,
		timeoutMs: 30_000,
		description: 'Labels, routing, and experiment variable detection',
	},
	WRITING: {
		preferred: SOL,
		fallbacks: [LUNA],
		reasoningEffort: 'low',
		temperature: 0.7,
		maxTokens: 4096,
		timeoutMs: 90_000,
		description: 'Channel-native drafts',
	},
	STRATEGY: {
		preferred: SOL,
		fallbacks: [LUNA],
		reasoningEffort: 'low',
		temperature: 0.4,
		maxTokens: 4096,
		timeoutMs: 90_000,
		description: 'Strategy, theme plans, and campaign design',
	},
	RESEARCH: {
		preferred: SOL,
		fallbacks: [LUNA],
		reasoningEffort: 'medium',
		temperature: 0.3,
		maxTokens: 4096,
		timeoutMs: 90_000,
		description: 'Research synthesis and evidence packing',
	},
	REVIEW: {
		preferred: SOL,
		fallbacks: [LUNA],
		reasoningEffort: 'low',
		temperature: 0.2,
		maxTokens: 3072,
		timeoutMs: 60_000,
		description: 'Brand compliance and prose review',
	},
	SIDECAR: {
		preferred: LUNA,
		fallbacks: [SOL],
		reasoningEffort: 'low',
		temperature: 0.7,
		maxTokens: 2048,
		timeoutMs: 60_000,
		description: 'Conversational brand and content help',
	},
	DEEP_STRATEGY: {
		preferred: ASTRA,
		fallbacks: [SOL],
		reasoningEffort: 'high',
		temperature: 0.3,
		maxTokens: 8192,
		timeoutMs: 120_000,
		description: 'Escalated strategy. Not used for ordinary generation.',
	},
};

const warnedLegacy = new Set<string>();

export function legacyModelOverridesEnabled(): boolean {
	return process.env.AI_LEGACY_MODEL_OVERRIDES === 'true';
}

function warnIgnoredLegacy(name: string): void {
	const value = process.env[name]?.trim();
	if (!value || legacyModelOverridesEnabled() || warnedLegacy.has(name)) return;
	warnedLegacy.add(name);
	console.warn(
		`[AI registry] Ignoring legacy ${name}. The central role catalog is authoritative. Set AI_MODEL_<ROLE> to override a role, or AI_LEGACY_MODEL_OVERRIDES=true during migration.`,
	);
}

function envKeyForRole(role: ModelRole): string {
	return `AI_MODEL_${role}`;
}

function parseCsv(value: string | undefined): string[] {
	if (!value?.trim()) return [];
	return value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

function legacyModelForRole(role: ModelRole): string | undefined {
	if (!legacyModelOverridesEnabled()) {
		if (role === 'WRITING') warnIgnoredLegacy('IDEA_ENGINE_LLM_MODEL');
		if (role === 'SIDECAR') {
			warnIgnoredLegacy('SIDECAR_LLM_MODEL');
			warnIgnoredLegacy('SIDECAR_OPENAI_MODEL');
		}
		return undefined;
	}
	if (role === 'WRITING') return process.env.IDEA_ENGINE_LLM_MODEL?.trim() || undefined;
	if (role === 'SIDECAR') {
		return process.env.SIDECAR_LLM_MODEL?.trim() || process.env.SIDECAR_OPENAI_MODEL?.trim() || undefined;
	}
	return undefined;
}

export function getRoleConfig(role: ModelRole): ModelRoleConfig {
	const defaults = ROLE_DEFAULTS[role];
	const explicit = process.env[envKeyForRole(role)]?.trim();
	const preferred = explicit || legacyModelForRole(role) || defaults.preferred;
	const extraFallbacks = parseCsv(process.env[`AI_MODEL_${role}_FALLBACKS`]);
	const fallbacks = [...extraFallbacks, ...defaults.fallbacks]
		.filter((model, index, all) => all.indexOf(model) === index && model !== preferred);

	return {
		role,
		provider: 'openai',
		preferred,
		fallbacks,
		reasoningEffort: defaults.reasoningEffort,
		temperature: defaults.temperature,
		maxTokens: defaults.maxTokens,
		timeoutMs: defaults.timeoutMs,
		description: defaults.description,
	};
}

export function resolveModelForRole(role: ModelRole): string {
	return getRoleConfig(role).preferred;
}

export function resolveModelCandidates(role: ModelRole): string[] {
	const config = getRoleConfig(role);
	return [config.preferred, ...config.fallbacks];
}

/** @deprecated GPT-6 routing lives in resolveModelRequestProfile. Kept for older call sites. */
export function isReasoningFamily(model: string): boolean {
	return /gpt-6|gpt-5|o1|o3|o4/i.test(model);
}

/** @deprecated Use resolveModelRequestProfile().tokenField. */
export function usesMaxCompletionTokens(model: string): boolean {
	return /gpt-5|o1|o3|o4/i.test(model);
}
