'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const ACTIONS = [
	'create_or_update_brand_profile',
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
	'update_content_status',
	'send_item_to_approval',
	'schedule_approved_content',
	'fetch_brand_content_queue',
	'fetch_operator_logs',
] as const;

type OperatorAction = (typeof ACTIONS)[number];
type LogStatus = 'started' | 'succeeded' | 'failed';

type OperatorStatusResponse = {
	ok: boolean;
	status?: {
		system: string;
		supabaseLoggingAvailable: boolean;
		operatorApiSecretConfigured: boolean;
		scopeMode: string;
		allowedSecretScopes: string[] | null;
		availableActions: OperatorAction[];
		recentActionCount: number;
		recentErrorCount: number;
		loggingError?: string;
		actor?: {
			type: string;
			id: string;
			scopes: string[];
		};
	};
	error?: string;
};

type OperatorLogItem = {
	id: string;
	created_at?: string;
	timestamp?: string;
	action: OperatorAction;
	status: LogStatus;
	request_id?: string;
	idempotency_key?: string | null;
	actor?: {
		type?: string;
		id?: string;
	};
	dryRun?: boolean;
	dry_run?: boolean;
	brand_profile_id?: string | null;
	content_id?: string | null;
	duration_ms?: number | null;
	error?: {
		code?: string;
		message?: string;
	};
	error_code?: string | null;
	error_message?: string | null;
	input_summary?: Record<string, unknown>;
	output_summary?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
};

type LogsResponse = {
	ok: boolean;
	items?: OperatorLogItem[];
	error?: string;
};

type ActionResponse = {
	ok?: boolean;
	error?: string;
	details?: unknown;
	[key: string]: unknown;
};

const MUTATING_ACTIONS = new Set<OperatorAction>([
	'create_or_update_brand_profile',
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
	'update_content_status',
	'send_item_to_approval',
	'schedule_approved_content',
]);

const GENERATION_ACTIONS = new Set<OperatorAction>([
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
]);

const SCHEDULING_ACTIONS = new Set<OperatorAction>(['schedule_approved_content']);

const ACTION_LABELS: Record<OperatorAction, string> = {
	create_or_update_brand_profile: 'Create or update brand profile',
	generate_or_refresh_brand_strategy: 'Generate or refresh brand strategy',
	generate_content_batch: 'Generate content batch',
	regenerate_individual_post: 'Regenerate individual post',
	update_content_status: 'Update content status',
	send_item_to_approval: 'Send item to approval',
	schedule_approved_content: 'Schedule approved content',
	fetch_brand_content_queue: 'Fetch brand content queue',
	fetch_operator_logs: 'Fetch operator logs',
};

const ACTION_RISK: Record<OperatorAction, string> = {
	create_or_update_brand_profile: 'Airtable mutation',
	generate_or_refresh_brand_strategy: 'Make webhook',
	generate_content_batch: 'Make webhook',
	regenerate_individual_post: 'Make webhook and Airtable mutation',
	update_content_status: 'Airtable mutation',
	send_item_to_approval: 'Airtable mutation',
	schedule_approved_content: 'Scheduling mutation',
	fetch_brand_content_queue: 'Read only',
	fetch_operator_logs: 'Read only',
};

const TEMPLATE_INPUTS: Record<OperatorAction, unknown> = {
	fetch_brand_content_queue: {
		brandProfileId: 'recXXXXXXXXXXXXXX',
		statuses: ['Needs Approval', 'Ready To Publish'],
		limit: 25,
	},
	fetch_operator_logs: {
		action: 'generate_content_batch',
		status: 'failed',
		limit: 25,
	},
	update_content_status: {
		contentId: 'recXXXXXXXXXXXXXX',
		status: 'Ready To Publish',
		notes: 'Operator dry-run check',
	},
	send_item_to_approval: {
		contentId: 'recXXXXXXXXXXXXXX',
		notes: 'Ready for approval review',
	},
	schedule_approved_content: {
		contentId: 'recXXXXXXXXXXXXXX',
		scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
	},
	generate_content_batch: {
		brandProfileId: 'recXXXXXXXXXXXXXX',
		platform: 'LinkedIn',
		triggerType: 'operator_requested',
	},
	regenerate_individual_post: {
		contentId: 'recXXXXXXXXXXXXXX',
		feedback: 'Make this post more specific and outcome-focused.',
	},
	generate_or_refresh_brand_strategy: {
		brandProfileId: 'recXXXXXXXXXXXXXX',
		mode: 'refresh',
		extraInstructions: 'Refresh strategy from current brand profile inputs.',
	},
	create_or_update_brand_profile: {
		userId: 'supabase-user-id',
		brandProfileId: 'optional-existing-rec-id',
		profile: {
			brand_type: 'company',
			client_name: 'Example Brand',
			audience: 'B2B founders and operators',
			value_props: 'Clear, practical content strategy',
			offers: 'Content strategy and execution',
			platforms_requested: ['LinkedIn'],
			timezone: 'Asia/Dubai',
			language_region: 'US English',
			preferred_image_source: 'AI Generated',
		},
	},
};

const READ_ONLY_MCP_ACTIONS: OperatorAction[] = ['fetch_brand_content_queue', 'fetch_operator_logs'];
const HUMAN_APPROVAL_MCP_ACTIONS: OperatorAction[] = [
	'create_or_update_brand_profile',
	'update_content_status',
	'send_item_to_approval',
	'schedule_approved_content',
];
const HIGH_IMPACT_MCP_ACTIONS: OperatorAction[] = [
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
	'schedule_approved_content',
];

function formatJson(value: unknown) {
	return JSON.stringify(value, null, 2);
}

function parseJsonObject(value: string) {
	const parsed: unknown = JSON.parse(value);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Payload must be a JSON object.');
	}
	return parsed as Record<string, unknown>;
}

function buildRequestPayload(action: OperatorAction, dryRun: boolean, idempotencyKey: string, inputText: string) {
	const input = parseJsonObject(inputText);
	return {
		action,
		dryRun,
		...(idempotencyKey.trim() ? { idempotencyKey: idempotencyKey.trim() } : {}),
		input,
	};
}

function safeString(value: unknown) {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return '';
}

function logCreatedAt(log: OperatorLogItem) {
	return log.created_at || log.timestamp || '';
}

function logDryRun(log: OperatorLogItem) {
	return log.dry_run ?? log.dryRun ?? false;
}

async function copyText(text: string) {
	await navigator.clipboard.writeText(text);
}

function StatusPill({ label, tone }: { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }) {
	const classes = {
		green: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
		yellow: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
		red: 'border-red-400/40 bg-red-400/10 text-red-200',
		blue: 'border-primary/40 bg-primary/10 text-primary',
		gray: 'border-edge bg-surface text-text-soft',
	};

	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
			{label}
		</span>
	);
}

function JsonBlock({ value }: { value: unknown }) {
	return (
		<pre className="max-h-80 overflow-auto rounded-xl border border-edge bg-bg/80 p-4 text-xs text-text-soft">
			{formatJson(value ?? {})}
		</pre>
	);
}

export function OperatorAdminConsole() {
	const [status, setStatus] = useState<OperatorStatusResponse['status'] | null>(null);
	const [statusError, setStatusError] = useState('');
	const [loadingStatus, setLoadingStatus] = useState(true);
	const [selectedAction, setSelectedAction] = useState<OperatorAction>('fetch_brand_content_queue');
	const [inputText, setInputText] = useState(formatJson(TEMPLATE_INPUTS.fetch_brand_content_queue));
	const [dryRun, setDryRun] = useState(false);
	const [idempotencyKey, setIdempotencyKey] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [actionResponse, setActionResponse] = useState<ActionResponse | null>(null);
	const [validationError, setValidationError] = useState('');
	const [logs, setLogs] = useState<OperatorLogItem[]>([]);
	const [logsError, setLogsError] = useState('');
	const [loadingLogs, setLoadingLogs] = useState(false);
	const [logActionFilter, setLogActionFilter] = useState('');
	const [logStatusFilter, setLogStatusFilter] = useState('');
	const [logLimit, setLogLimit] = useState(50);
	const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
	const [copiedLabel, setCopiedLabel] = useState('');

	const requestPreview = useMemo(() => {
		try {
			return buildRequestPayload(selectedAction, dryRun, idempotencyKey, inputText);
		} catch {
			return {
				action: selectedAction,
				dryRun,
				...(idempotencyKey.trim() ? { idempotencyKey: idempotencyKey.trim() } : {}),
				input: '[invalid JSON]',
			};
		}
	}, [selectedAction, dryRun, idempotencyKey, inputText]);

	async function withCopy(label: string, text: string) {
		await copyText(text);
		setCopiedLabel(label);
		window.setTimeout(() => setCopiedLabel(''), 1500);
	}

	const loadStatus = useCallback(async () => {
		setLoadingStatus(true);
		setStatusError('');
		try {
			const response = await fetch('/api/operator/status', { cache: 'no-store' });
			const data = await response.json() as OperatorStatusResponse;
			if (!response.ok || !data.ok) {
				throw new Error(data.error || 'Failed to load operator status');
			}
			setStatus(data.status || null);
		} catch (error) {
			setStatusError(error instanceof Error ? error.message : 'Failed to load operator status');
		} finally {
			setLoadingStatus(false);
		}
	}, []);

	const loadLogs = useCallback(async () => {
		setLoadingLogs(true);
		setLogsError('');
		try {
			const params = new URLSearchParams();
			if (logActionFilter) params.set('action', logActionFilter);
			if (logStatusFilter) params.set('status', logStatusFilter);
			params.set('limit', String(logLimit));
			const response = await fetch(`/api/operator/logs?${params.toString()}`, { cache: 'no-store' });
			const data = await response.json() as LogsResponse;
			if (!response.ok || !data.ok) {
				throw new Error(data.error || 'Failed to load operator logs');
			}
			setLogs(data.items || []);
		} catch (error) {
			setLogsError(error instanceof Error ? error.message : 'Failed to load operator logs');
		} finally {
			setLoadingLogs(false);
		}
	}, [logActionFilter, logLimit, logStatusFilter]);

	useEffect(() => {
		void loadStatus();
		void loadLogs();
	}, [loadLogs, loadStatus]);

	function selectAction(action: OperatorAction) {
		setSelectedAction(action);
		setInputText(formatJson(TEMPLATE_INPUTS[action]));
		setDryRun(MUTATING_ACTIONS.has(action));
		setActionResponse(null);
		setValidationError('');
	}

	async function submitAction() {
		setSubmitting(true);
		setValidationError('');
		setActionResponse(null);
		try {
			const payload = buildRequestPayload(selectedAction, dryRun, idempotencyKey, inputText);
			const response = await fetch('/api/operator/actions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(idempotencyKey.trim() ? { 'x-idempotency-key': idempotencyKey.trim() } : {}),
				},
				body: JSON.stringify(payload),
			});
			const data = await response.json() as ActionResponse;
			setActionResponse(data);
			if (!response.ok || data.ok === false) {
				setValidationError(data.error || `Request failed with status ${response.status}`);
			}
			void loadStatus();
			void loadLogs();
		} catch (error) {
			setValidationError(error instanceof Error ? error.message : 'Unable to submit operator action');
		} finally {
			setSubmitting(false);
		}
	}

	const visibleActions = status?.availableActions?.length ? status.availableActions : [...ACTIONS];
	const recentErrorCount = status?.recentErrorCount ?? logs.filter((log) => log.status === 'failed').length;
	const recentActionCount = status?.recentActionCount ?? logs.length;

	return (
		<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
			<div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<Link href="/admin" className="text-sm text-primary hover:text-primary/80">
						Back to admin
					</Link>
					<h1 className="mt-3 text-3xl font-bold text-text">Operator Admin Console</h1>
					<p className="mt-2 max-w-3xl text-sm text-text-soft">
						Internal tooling for safely exercising protected operator actions before they become MCP tools.
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						void loadStatus();
						void loadLogs();
					}}
					className="rounded-xl border border-edge bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-surface/80"
				>
					Refresh console
				</button>
			</div>

			<section className="mb-8 rounded-2xl border border-edge bg-surface/80 p-5">
				<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-xl font-semibold text-text">Operator Overview</h2>
						<p className="text-sm text-text-soft">Protected status for the current admin session.</p>
					</div>
					{loadingStatus ? (
						<StatusPill label="Checking status" tone="gray" />
					) : status?.system === 'ready' ? (
						<StatusPill label="Ready" tone="green" />
					) : (
						<StatusPill label="Degraded" tone="yellow" />
					)}
				</div>

				{statusError && (
					<div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
						{statusError}
					</div>
				)}

				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<div className="text-xs uppercase tracking-wide text-text-soft">Supabase logging</div>
						<div className="mt-2 text-lg font-semibold text-text">
							{status?.supabaseLoggingAvailable ? 'Available' : 'Unavailable'}
						</div>
					</div>
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<div className="text-xs uppercase tracking-wide text-text-soft">Operator secret</div>
						<div className="mt-2 text-lg font-semibold text-text">
							{status?.operatorApiSecretConfigured ? 'Configured' : 'Not configured'}
						</div>
					</div>
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<div className="text-xs uppercase tracking-wide text-text-soft">Scope mode</div>
						<div className="mt-2 text-lg font-semibold text-text">
							{status?.scopeMode === 'restricted_secret_scopes' ? 'Restricted secret scopes' : 'Admin full access'}
						</div>
					</div>
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<div className="text-xs uppercase tracking-wide text-text-soft">Recent 24h</div>
						<div className="mt-2 text-lg font-semibold text-text">
							{recentActionCount} actions / {recentErrorCount} errors
						</div>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap gap-2">
					{visibleActions.map((action) => (
						<StatusPill key={action} label={action} tone={GENERATION_ACTIONS.has(action) ? 'yellow' : MUTATING_ACTIONS.has(action) ? 'blue' : 'gray'} />
					))}
				</div>

				{status?.loggingError && (
					<p className="mt-3 text-xs text-amber-200">Logging check: {status.loggingError}</p>
				)}
			</section>

			<section className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
				<div className="rounded-2xl border border-edge bg-surface/80 p-5">
					<div className="mb-4">
						<h2 className="text-xl font-semibold text-text">Action Runner</h2>
						<p className="text-sm text-text-soft">
							Dry-run checks the request without triggering Airtable or Make where supported.
						</p>
					</div>

					<div className="grid gap-4 lg:grid-cols-2">
						<label className="block">
							<span className="text-sm font-medium text-text">Action</span>
							<select
								value={selectedAction}
								onChange={(event) => selectAction(event.target.value as OperatorAction)}
								className="mt-2 w-full rounded-xl border border-edge bg-bg p-3 text-sm text-text"
							>
								{visibleActions.map((action) => (
									<option key={action} value={action}>
										{ACTION_LABELS[action]}
									</option>
								))}
							</select>
						</label>

						<label className="block">
							<span className="text-sm font-medium text-text">Idempotency key</span>
							<input
								value={idempotencyKey}
								onChange={(event) => setIdempotencyKey(event.target.value)}
								placeholder="optional-safe-repeat-key"
								className="mt-2 w-full rounded-xl border border-edge bg-bg p-3 text-sm text-text placeholder:text-text-soft"
							/>
						</label>
					</div>

					<div className="mt-4 flex flex-wrap items-center gap-3">
						<label className="inline-flex items-center gap-2 rounded-xl border border-edge bg-bg/70 px-3 py-2 text-sm text-text">
							<input
								type="checkbox"
								checked={dryRun}
								onChange={(event) => setDryRun(event.target.checked)}
								className="h-4 w-4"
							/>
							Dry-run
						</label>
						<StatusPill label={ACTION_RISK[selectedAction]} tone={GENERATION_ACTIONS.has(selectedAction) || SCHEDULING_ACTIONS.has(selectedAction) ? 'yellow' : MUTATING_ACTIONS.has(selectedAction) ? 'blue' : 'green'} />
						{GENERATION_ACTIONS.has(selectedAction) && (
							<span className="text-xs text-amber-200">Generation actions may trigger Make webhooks.</span>
						)}
						{SCHEDULING_ACTIONS.has(selectedAction) && (
							<span className="text-xs text-amber-200">Scheduling actions should only be used for content already ready to publish.</span>
						)}
					</div>

					<label className="mt-5 block">
						<span className="text-sm font-medium text-text">Input JSON</span>
						<textarea
							value={inputText}
							onChange={(event) => setInputText(event.target.value)}
							spellCheck={false}
							rows={18}
							className="mt-2 w-full rounded-xl border border-edge bg-bg p-4 font-mono text-xs text-text outline-none focus:border-primary"
						/>
					</label>

					{validationError && (
						<div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
							{validationError}
							{actionResponse?.details ? <JsonBlock value={actionResponse.details} /> : null}
						</div>
					)}

					<div className="mt-5 flex flex-wrap gap-3">
						<button
							type="button"
							onClick={() => void submitAction()}
							disabled={submitting}
							className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-60"
						>
							{submitting ? 'Running action...' : dryRun ? 'Run dry-run' : 'Run action'}
						</button>
						<button
							type="button"
							onClick={() => void withCopy('request', formatJson(requestPreview))}
							className="rounded-xl border border-edge bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-surface"
						>
							Copy request
						</button>
						<button
							type="button"
							onClick={() => setInputText(formatJson(TEMPLATE_INPUTS[selectedAction]))}
							className="rounded-xl border border-edge bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-surface"
						>
							Reset template
						</button>
					</div>
				</div>

				<div className="space-y-6">
					<div className="rounded-2xl border border-edge bg-surface/80 p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-lg font-semibold text-text">Request Preview</h3>
							{copiedLabel === 'request' && <span className="text-xs text-emerald-200">Copied</span>}
						</div>
						<JsonBlock value={requestPreview} />
					</div>

					<div className="rounded-2xl border border-edge bg-surface/80 p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-lg font-semibold text-text">Response</h3>
							<button
								type="button"
								disabled={!actionResponse}
								onClick={() => void withCopy('response', formatJson(actionResponse || {}))}
								className="rounded-lg border border-edge px-3 py-1 text-xs text-text-soft disabled:opacity-50"
							>
								Copy response
							</button>
						</div>
						{copiedLabel === 'response' && <p className="mb-2 text-xs text-emerald-200">Copied response</p>}
						<JsonBlock value={actionResponse || { message: 'Run an action to see the response.' }} />
					</div>

					<div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
						<h3 className="text-lg font-semibold text-amber-100">Safety notes</h3>
						<ul className="mt-3 space-y-2 text-sm text-amber-100/90">
							<li>Dry-run checks the request without triggering Airtable or Make where supported.</li>
							<li>Generation actions may trigger Make webhooks.</li>
							<li>Scheduling actions should only be used for content already ready to publish.</li>
							<li>Idempotency keys prevent accidental duplicate runs.</li>
						</ul>
					</div>
				</div>
			</section>

			<section className="mb-8 rounded-2xl border border-edge bg-surface/80 p-5">
				<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<h2 className="text-xl font-semibold text-text">Operator Logs</h2>
						<p className="text-sm text-text-soft">Durable Supabase audit logs with redacted summaries.</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<select
							value={logActionFilter}
							onChange={(event) => setLogActionFilter(event.target.value)}
							className="rounded-xl border border-edge bg-bg px-3 py-2 text-sm text-text"
						>
							<option value="">All actions</option>
							{ACTIONS.map((action) => (
								<option key={action} value={action}>
									{action}
								</option>
							))}
						</select>
						<select
							value={logStatusFilter}
							onChange={(event) => setLogStatusFilter(event.target.value)}
							className="rounded-xl border border-edge bg-bg px-3 py-2 text-sm text-text"
						>
							<option value="">All statuses</option>
							<option value="started">started</option>
							<option value="succeeded">succeeded</option>
							<option value="failed">failed</option>
						</select>
						<input
							type="number"
							min={1}
							max={200}
							value={logLimit}
							onChange={(event) => setLogLimit(Number(event.target.value))}
							className="w-24 rounded-xl border border-edge bg-bg px-3 py-2 text-sm text-text"
						/>
						<button
							type="button"
							onClick={() => void loadLogs()}
							className="rounded-xl border border-edge bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-surface"
						>
							{loadingLogs ? 'Loading...' : 'Apply filters'}
						</button>
					</div>
				</div>

				{logsError && (
					<div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
						{logsError}
					</div>
				)}

				<div className="overflow-x-auto">
					<table className="w-full min-w-[1100px] text-left text-sm">
						<thead className="border-b border-edge text-xs uppercase tracking-wide text-text-soft">
							<tr>
								<th className="px-3 py-3">Created</th>
								<th className="px-3 py-3">Action</th>
								<th className="px-3 py-3">Status</th>
								<th className="px-3 py-3">Request</th>
								<th className="px-3 py-3">Idempotency</th>
								<th className="px-3 py-3">Actor</th>
								<th className="px-3 py-3">Dry-run</th>
								<th className="px-3 py-3">Brand</th>
								<th className="px-3 py-3">Content</th>
								<th className="px-3 py-3">Duration</th>
								<th className="px-3 py-3">Error</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-edge">
							{logs.map((log) => {
								const expanded = expandedLogId === log.id;
								const createdAt = logCreatedAt(log);
								const errorCode = log.error_code || log.error?.code || '';
								const errorMessage = log.error_message || log.error?.message || '';
								return (
									<tr key={log.id} className="align-top text-text-soft">
										<td className="px-3 py-3">
											<button
												type="button"
												onClick={() => setExpandedLogId(expanded ? null : log.id)}
												className="text-left text-text hover:text-primary"
											>
												{createdAt ? new Date(createdAt).toLocaleString() : '-'}
											</button>
											{expanded && (
												<div className="mt-3 w-[720px] space-y-3 rounded-xl border border-edge bg-bg p-4">
													<div>
														<div className="mb-1 text-xs font-semibold text-text">Input summary</div>
														<JsonBlock value={log.input_summary || {}} />
													</div>
													<div>
														<div className="mb-1 text-xs font-semibold text-text">Output summary</div>
														<JsonBlock value={log.output_summary || {}} />
													</div>
													<div>
														<div className="mb-1 text-xs font-semibold text-text">Metadata</div>
														<JsonBlock value={log.metadata || {}} />
													</div>
												</div>
											)}
										</td>
										<td className="px-3 py-3 text-text">{log.action}</td>
										<td className="px-3 py-3">
											<StatusPill
												label={log.status}
												tone={log.status === 'succeeded' ? 'green' : log.status === 'failed' ? 'red' : 'gray'}
											/>
										</td>
										<td className="px-3 py-3 font-mono text-xs">{safeString(log.request_id)}</td>
										<td className="px-3 py-3 font-mono text-xs">{safeString(log.idempotency_key)}</td>
										<td className="px-3 py-3">{log.actor?.type || '-'}</td>
										<td className="px-3 py-3">{logDryRun(log) ? 'Yes' : 'No'}</td>
										<td className="px-3 py-3 font-mono text-xs">{safeString(log.brand_profile_id)}</td>
										<td className="px-3 py-3 font-mono text-xs">{safeString(log.content_id)}</td>
										<td className="px-3 py-3">{log.duration_ms ?? '-'}</td>
										<td className="px-3 py-3">
											{errorCode || errorMessage ? (
												<div>
													<div className="font-mono text-xs text-red-200">{errorCode}</div>
													<div className="max-w-xs text-xs text-red-100">{errorMessage}</div>
												</div>
											) : (
												'-'
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				{logs.length === 0 && !loadingLogs && (
					<p className="mt-4 text-sm text-text-soft">No operator logs found for the current filters.</p>
				)}
			</section>

			<section className="rounded-2xl border border-edge bg-surface/80 p-5">
				<h2 className="text-xl font-semibold text-text">MCP Preparation</h2>
				<p className="mt-2 text-sm text-text-soft">
					Static readiness notes for mapping these operator actions into future MCP tools.
				</p>
				<div className="mt-5 grid gap-4 lg:grid-cols-3">
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<h3 className="font-semibold text-text">Read-only tools</h3>
						<ul className="mt-3 space-y-2 text-sm text-text-soft">
							{READ_ONLY_MCP_ACTIONS.map((action) => (
								<li key={action}>{action}</li>
							))}
						</ul>
					</div>
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<h3 className="font-semibold text-text">Require human approval</h3>
						<ul className="mt-3 space-y-2 text-sm text-text-soft">
							{HUMAN_APPROVAL_MCP_ACTIONS.map((action) => (
								<li key={action}>{action}</li>
							))}
						</ul>
					</div>
					<div className="rounded-xl border border-edge bg-bg/50 p-4">
						<h3 className="font-semibold text-text">High-impact actions</h3>
						<ul className="mt-3 space-y-2 text-sm text-text-soft">
							{HIGH_IMPACT_MCP_ACTIONS.map((action) => (
								<li key={action}>{action}</li>
							))}
						</ul>
					</div>
				</div>
			</section>
		</main>
	);
}
