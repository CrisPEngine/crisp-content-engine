/** Internal states */
export type ConnectionPhase =
	| 'NOT_CONNECTED'
	| 'AUTHORIZED_UNASSIGNED'
	| 'ASSIGNED'
	| 'READY'
	| 'ACTION_REQUIRED';

/** User-facing label */
export type ConnectionUiLabel =
	| 'Not connected'
	| 'Account available — choose destination'
	| 'Connected'
	| 'Ready to publish'
	| 'Action required';

export function uiLabelForPhase(phase: ConnectionPhase): ConnectionUiLabel {
	switch (phase) {
		case 'NOT_CONNECTED':
			return 'Not connected';
		case 'AUTHORIZED_UNASSIGNED':
			return 'Account available — choose destination';
		case 'ASSIGNED':
			return 'Connected';
		case 'READY':
			return 'Ready to publish';
		case 'ACTION_REQUIRED':
			return 'Action required';
	}
}
