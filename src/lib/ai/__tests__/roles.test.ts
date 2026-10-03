import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_ROLES, getRoleConfig, legacyModelOverridesEnabled, resolveModelCandidates, resolveModelForRole } from '../roles';

const ENV_KEYS = [
	'AI_MODEL_SIDECAR',
	'AI_MODEL_WRITING',
	'SIDECAR_LLM_MODEL',
	'IDEA_ENGINE_LLM_MODEL',
	'AI_LEGACY_MODEL_OVERRIDES',
] as const;

afterEach(() => {
	for (const key of ENV_KEYS) delete process.env[key];
});

describe('AI model roles', () => {
	it('assigns the GPT-6 catalog and keeps Astra off ordinary generation', () => {
		expect(MODEL_ROLES).toContain('DEEP_STRATEGY');
		expect(getRoleConfig('FAST').preferred).toBe('gpt-6-luna');
		expect(getRoleConfig('EXTRACTION').preferred).toBe('gpt-6-luna');
		expect(getRoleConfig('CLASSIFICATION').preferred).toBe('gpt-6-luna');
		expect(getRoleConfig('SIDECAR').preferred).toBe('gpt-6-luna');
		expect(getRoleConfig('WRITING').preferred).toBe('gpt-6.1-sol');
		expect(getRoleConfig('STRATEGY').preferred).toBe('gpt-6.1-sol');
		expect(getRoleConfig('RESEARCH').preferred).toBe('gpt-6.1-sol');
		expect(getRoleConfig('REVIEW').preferred).toBe('gpt-6.1-sol');
		expect(getRoleConfig('DEEP_STRATEGY').preferred).toBe('gpt-6-astra');
		expect(getRoleConfig('STRATEGY').preferred).not.toBe('gpt-6-astra');
		expect(getRoleConfig('WRITING').fallbacks).not.toContain('gpt-4o');
		expect(getRoleConfig('WRITING').fallbacks).not.toContain('gpt-5.6');
	});

	it('lets AI_MODEL_<ROLE> override the catalog', () => {
		process.env.AI_MODEL_WRITING = 'gpt-test-writing';
		expect(resolveModelForRole('WRITING')).toBe('gpt-test-writing');
		expect(resolveModelCandidates('WRITING')[0]).toBe('gpt-test-writing');
	});

	it('ignores legacy production model env unless the migration flag is set', () => {
		process.env.IDEA_ENGINE_LLM_MODEL = 'gpt-4o';
		process.env.SIDECAR_LLM_MODEL = 'gpt-4o-mini';
		expect(legacyModelOverridesEnabled()).toBe(false);
		expect(resolveModelForRole('WRITING')).toBe('gpt-6.1-sol');
		expect(resolveModelForRole('SIDECAR')).toBe('gpt-6-luna');

		process.env.AI_LEGACY_MODEL_OVERRIDES = 'true';
		expect(resolveModelForRole('WRITING')).toBe('gpt-4o');
		expect(resolveModelForRole('SIDECAR')).toBe('gpt-4o-mini');
	});

	it('keeps an explicit registry override ahead of the legacy flag', () => {
		process.env.AI_LEGACY_MODEL_OVERRIDES = 'true';
		process.env.IDEA_ENGINE_LLM_MODEL = 'gpt-4o';
		process.env.AI_MODEL_WRITING = 'gpt-6.1-sol';
		expect(resolveModelForRole('WRITING')).toBe('gpt-6.1-sol');
	});
});
