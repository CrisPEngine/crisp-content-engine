import { describe, expect, it } from 'vitest';
import { MODEL_ROLES, getRoleConfig, resolveModelCandidates, resolveModelForRole } from '../roles';

describe('AI model roles', () => {
	it('defines every required role without exposing literal models to callers via the role name', () => {
		expect(MODEL_ROLES).toEqual([
			'FAST',
			'EXTRACTION',
			'CLASSIFICATION',
			'WRITING',
			'STRATEGY',
			'RESEARCH',
			'REVIEW',
			'SIDECAR',
		]);
	});

	it('keeps FAST cheaper than WRITING/SIDECAR', () => {
		expect(getRoleConfig('FAST').preferred).toContain('mini');
		expect(getRoleConfig('SIDECAR').preferred).not.toBe('gpt-4o-mini');
		expect(resolveModelCandidates('SIDECAR')[0]).toBe(resolveModelForRole('SIDECAR'));
		expect(resolveModelCandidates('WRITING').length).toBeGreaterThan(1);
	});

	it('honours AI_MODEL_SIDECAR and explicit non-mini SIDECAR_LLM_MODEL', () => {
		process.env.SIDECAR_LLM_MODEL = 'gpt-4o';
		expect(resolveModelForRole('SIDECAR')).toBe('gpt-4o');
		delete process.env.SIDECAR_LLM_MODEL;
		process.env.AI_MODEL_SIDECAR = 'gpt-test-sidecar';
		expect(resolveModelForRole('SIDECAR')).toBe('gpt-test-sidecar');
		delete process.env.AI_MODEL_SIDECAR;
	});

	it('ignores the legacy gpt-4o-mini Sidecar default so the capable writing model is used', () => {
		process.env.SIDECAR_LLM_MODEL = 'gpt-4o-mini';
		expect(resolveModelForRole('SIDECAR')).not.toBe('gpt-4o-mini');
		delete process.env.SIDECAR_LLM_MODEL;
	});

	it('honours IDEA_ENGINE_LLM_MODEL for WRITING', () => {
		process.env.IDEA_ENGINE_LLM_MODEL = 'gpt-4o';
		expect(resolveModelForRole('WRITING')).toBe('gpt-4o');
		delete process.env.IDEA_ENGINE_LLM_MODEL;
	});
});
