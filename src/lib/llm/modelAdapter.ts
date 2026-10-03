/**
 * Maps a model id to the OpenAI request shape.
 * Product code asks for a role; this adapter owns endpoint and parameter differences.
 */

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ModelApi = 'responses' | 'chat_completions';

export type ModelRequestProfile = {
	api: ModelApi;
	reasoningEffort?: ReasoningEffort;
	/** GPT-6 rejects temperature unless reasoning effort is none. CCE omits it for the whole GPT-6 family. */
	sendTemperature: boolean;
	tokenField: 'max_output_tokens' | 'max_completion_tokens' | 'max_tokens';
};

const LUNA_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const SOL_ASTRA_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function isGpt6Family(model: string): boolean {
	return /^gpt-6(\.|-|$)/i.test(model);
}

export function isGpt6Luna(model: string): boolean {
	return /gpt-6-luna/i.test(model);
}

function clampEffort(model: string, requested: ReasoningEffort | undefined): ReasoningEffort {
	const allowed = isGpt6Luna(model) ? LUNA_EFFORTS : SOL_ASTRA_EFFORTS;
	const effort = requested ?? (isGpt6Luna(model) ? 'low' : 'medium');
	if (allowed.includes(effort)) return effort;
	return allowed[0];
}

export function resolveModelRequestProfile(
	model: string,
	requestedEffort?: ReasoningEffort,
): ModelRequestProfile {
	if (isGpt6Family(model)) {
		return {
			api: 'responses',
			reasoningEffort: clampEffort(model, requestedEffort),
			sendTemperature: false,
			tokenField: 'max_output_tokens',
		};
	}

	if (/gpt-5|o1|o3|o4/i.test(model)) {
		return {
			api: 'chat_completions',
			sendTemperature: false,
			tokenField: 'max_completion_tokens',
		};
	}

	return {
		api: 'chat_completions',
		sendTemperature: true,
		tokenField: 'max_tokens',
	};
}
