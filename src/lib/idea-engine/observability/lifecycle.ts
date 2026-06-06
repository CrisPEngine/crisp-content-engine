import 'server-only';

export type IdeaEngineLifecycleEvent =
	| 'run_created'
	| 'after_job_started'
	| 'execute_route_invoked'
	| 'context_load_started'
	| 'context_load_completed'
	| 'channel_generation_started'
	| 'openai_request_started'
	| 'openai_request_completed'
	| 'validation_started'
	| 'validation_completed'
	| 'item_persisted'
	| 'run_marked_review'
	| 'run_marked_failed'
	| 'execute_dispatch_failed'
	| 'execute_dispatched';

export function logIdeaEngineLifecycle(
	event: IdeaEngineLifecycleEvent,
	runId: string,
	details?: Record<string, unknown>,
): void {
	console.log('[IdeaEngine/Lifecycle]', {
		event,
		run_id: runId,
		...details,
	});
}
