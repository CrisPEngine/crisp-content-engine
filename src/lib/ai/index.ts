export {
	MODEL_ROLES,
	getRoleConfig,
	isReasoningFamily,
	resolveModelCandidates,
	resolveModelForRole,
	usesMaxCompletionTokens,
	type ModelRole,
	type ModelRoleConfig,
} from './roles';

export { completeWithRole, type CompleteWithRoleOptions } from './complete';
export { logAiInvocation, type AiInvocationLog } from './logging';
