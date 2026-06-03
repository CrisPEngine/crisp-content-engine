import { OperatorActionError } from './errors';
import type { OperatorActor } from './logger';
import type { OperatorActionName } from './schemas';

export const operatorScopes = [
	'operator:read',
	'operator:write',
	'operator:generate',
	'operator:schedule',
	'operator:admin',
] as const;

export type OperatorScope = (typeof operatorScopes)[number];

const actionScopes: Record<OperatorActionName, OperatorScope[]> = {
	create_or_update_brand_profile: ['operator:write'],
	generate_or_refresh_brand_strategy: ['operator:generate'],
	generate_content_batch: ['operator:generate'],
	regenerate_individual_post: ['operator:generate', 'operator:write'],
	update_content_status: ['operator:write'],
	send_item_to_approval: ['operator:write'],
	schedule_approved_content: ['operator:schedule'],
	fetch_brand_content_queue: ['operator:read'],
	fetch_operator_logs: ['operator:admin'],
};

export function requiredScopesForAction(action: OperatorActionName) {
	return actionScopes[action];
}

export function hasOperatorScope(actor: OperatorActor, scope: OperatorScope) {
	return actor.scopes.includes('operator:admin') || actor.scopes.includes(scope);
}

export function assertActorCanRunAction(actor: OperatorActor, action: OperatorActionName) {
	const requiredScopes = requiredScopesForAction(action);
	const missingScopes = requiredScopes.filter((scope) => !hasOperatorScope(actor, scope));

	if (missingScopes.length > 0) {
		throw new OperatorActionError('Operator scope is not allowed for this action', {
			status: 403,
			code: 'operator_scope_forbidden',
			details: {
				action,
				requiredScopes,
				actorScopes: actor.scopes,
			},
		});
	}
}
