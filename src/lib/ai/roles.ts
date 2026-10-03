/**
 * Central model-role catalog.
 * Application code should request a role, not a literal model name.
 * Override any role with AI_MODEL_<ROLE> (e.g. AI_MODEL_SIDECAR=gpt-4o).
 */

export const MODEL_ROLES = [
	'FAST',
	'EXTRACTION',
	'CLASSIFICATION',
	'WRITING',
	'STRATEGY',
	'RESEARCH',
	'REVIEW',
	'SIDECAR',
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export type ModelRoleConfig = {
	role: ModelRole;
	/** Preferred model. Never read this from feature code — use resolveModelForRole. */
	preferred: string;
	fallbacks: string[];
	temperature: number;
	maxTokens: number;
	timeoutMs: number;
	/** Reasoning-style models often reject custom temperature. */
	omitTemperature: boolean;
	description: string;
};

const GPT_5_6 = 'gpt-5.6';
const GPT_5 = 'gpt-5';
const GPT_4O = 'gpt-4o';
const GPT_4O_MINI = 'gpt-4o-mini';

const ROLE_DEFAULTS: Record<ModelRole, Omit<ModelRoleConfig, 'role'>> = {
	FAST: {
		preferred: GPT_4O_MINI,
		fallbacks: [GPT_4O],
		temperature: 0.2,
		maxTokens: 1024,
		timeoutMs: 30_000,
		omitTemperature: false,
		description: 'Cheap/low-latency tasks: tagging, routing, short transforms',
	},
	EXTRACTION: {
		preferred: GPT_4O_MINI,
		fallbacks: [GPT_4O],
		temperature: 0,
		maxTokens: 2048,
		timeoutMs: 45_000,
		omitTemperature: false,
		description: 'Structured extraction from existing text',
	},
	CLASSIFICATION: {
		preferred: GPT_4O_MINI,
		fallbacks: [GPT_4O],
		temperature: 0,
		maxTokens: 1024,
		timeoutMs: 30_000,
		omitTemperature: false,
		description: 'Labels, routing, experiment variable detection',
	},
	WRITING: {
		preferred: GPT_5_6,
		fallbacks: [GPT_5, GPT_4O],
		temperature: 0.7,
		maxTokens: 4096,
		timeoutMs: 90_000,
		omitTemperature: true,
		description: 'Long-form and channel-native drafts',
	},
	STRATEGY: {
		preferred: GPT_5_6,
		fallbacks: [GPT_5, GPT_4O],
		temperature: 0.4,
		maxTokens: 4096,
		timeoutMs: 90_000,
		omitTemperature: true,
		description: 'Strategy, theme plans, campaign design',
	},
	RESEARCH: {
		preferred: GPT_5,
		fallbacks: [GPT_4O],
		temperature: 0.3,
		maxTokens: 4096,
		timeoutMs: 90_000,
		omitTemperature: true,
		description: 'Research synthesis and evidence packing',
	},
	REVIEW: {
		preferred: GPT_5,
		fallbacks: [GPT_4O],
		temperature: 0.2,
		maxTokens: 3072,
		timeoutMs: 60_000,
		omitTemperature: true,
		description: 'Brand compliance and prose review',
	},
	SIDECAR: {
		preferred: GPT_5_6,
		fallbacks: [GPT_5, GPT_4O],
		temperature: 0.7,
		maxTokens: 2048,
		timeoutMs: 60_000,
		omitTemperature: true,
		description: 'Conversational brand/content intelligence for Sidecar',
	},
};

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

export function getRoleConfig(role: ModelRole): ModelRoleConfig {
	const defaults = ROLE_DEFAULTS[role];
	const sidecarLegacy = process.env.SIDECAR_LLM_MODEL?.trim() || process.env.SIDECAR_OPENAI_MODEL?.trim();
	const sidecarOverride = process.env.AI_MODEL_SIDECAR?.trim();
	const writingOverride = process.env.AI_MODEL_WRITING?.trim() || process.env.IDEA_ENGINE_LLM_MODEL?.trim();

	const preferred =
		process.env[envKeyForRole(role)]?.trim() ||
		(role === 'SIDECAR'
			? sidecarOverride || (sidecarLegacy && sidecarLegacy !== 'gpt-4o-mini' ? sidecarLegacy : undefined)
			: undefined) ||
		(role === 'WRITING' ? writingOverride : undefined) ||
		defaults.preferred;

	const extraFallbacks = parseCsv(process.env[`AI_MODEL_${role}_FALLBACKS`]);
	const fallbacks = [
		...extraFallbacks,
		...defaults.fallbacks.filter((model) => model !== preferred),
	].filter((model, index, all) => all.indexOf(model) === index && model !== preferred);

	return {
		role,
		preferred,
		fallbacks,
		temperature: defaults.temperature,
		maxTokens: defaults.maxTokens,
		timeoutMs: defaults.timeoutMs,
		omitTemperature: defaults.omitTemperature || isReasoningFamily(preferred),
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

export function isReasoningFamily(model: string): boolean {
	return /gpt-5|o1|o3|o4/i.test(model);
}

export function usesMaxCompletionTokens(model: string): boolean {
	return isReasoningFamily(model);
}
