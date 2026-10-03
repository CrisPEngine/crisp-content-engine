import { describe, expect, it } from 'vitest';
import { resolveModelRequestProfile } from '../modelAdapter';

describe('model request adapter', () => {
	it('sends GPT-6 Luna through Responses without temperature and allows effort none', () => {
		expect(resolveModelRequestProfile('gpt-6-luna', 'none')).toEqual({
			api: 'responses',
			reasoningEffort: 'none',
			sendTemperature: false,
			tokenField: 'max_output_tokens',
		});
	});

	it('raises none to low for Sol and Astra', () => {
		expect(resolveModelRequestProfile('gpt-6.1-sol', 'none').reasoningEffort).toBe('low');
		expect(resolveModelRequestProfile('gpt-6-astra', 'none').reasoningEffort).toBe('low');
		expect(resolveModelRequestProfile('gpt-6-astra', 'high').reasoningEffort).toBe('high');
	});

	it('keeps older chat models on chat completions', () => {
		expect(resolveModelRequestProfile('gpt-4o').api).toBe('chat_completions');
		expect(resolveModelRequestProfile('gpt-4o').sendTemperature).toBe(true);
		expect(resolveModelRequestProfile('gpt-4o').tokenField).toBe('max_tokens');
		expect(resolveModelRequestProfile('gpt-5.6').tokenField).toBe('max_completion_tokens');
		expect(resolveModelRequestProfile('gpt-5.6').sendTemperature).toBe(false);
	});
});