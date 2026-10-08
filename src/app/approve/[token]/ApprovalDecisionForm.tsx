'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
	approvalPendingLabel,
	approvalSubmitLabel,
	type ApprovalDecision,
	type ApprovalUiMode,
} from './approvalFeedback';

const pressableButton =
	'touch-manipulation select-none transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-60';

type DecideAction = (formData: FormData) => void | Promise<void>;

function ActionFieldset({
	mode,
	activeDecision,
	onSelect,
}: {
	mode: ApprovalUiMode;
	activeDecision: ApprovalDecision | null;
	onSelect: (decision: ApprovalDecision) => void;
}) {
	const { pending } = useFormStatus();

	return (
		<fieldset
			disabled={pending}
			aria-busy={pending}
			className="grid min-w-0 gap-3 border-0 p-0 m-0"
		>
			<FormStatusAnnouncer activeDecision={activeDecision} mode={mode} pending={pending} />
			<button
				type="submit"
				name="decision"
				value="approve"
				aria-busy={pending && activeDecision === 'approve'}
				onClick={() => onSelect('approve')}
				className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl2 bg-primary px-4 text-white hover:bg-primary/90 active:bg-primary/80 ${pressableButton}`}
			>
				{pending && activeDecision === 'approve' ? (
					<>
						<Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
						<span>{approvalPendingLabel('approve', mode)}</span>
					</>
				) : (
					<span>{approvalSubmitLabel('approve', mode)}</span>
				)}
			</button>
			<button
				type="submit"
				name="decision"
				value="reject"
				aria-busy={pending && activeDecision === 'reject'}
				onClick={() => onSelect('reject')}
				className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl2 border border-edge/60 bg-surface/40 px-4 hover:bg-surface/60 active:bg-surface/80 ${pressableButton}`}
			>
				{pending && activeDecision === 'reject' ? (
					<>
						<Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
						<span>{approvalPendingLabel('reject', mode)}</span>
					</>
				) : (
					<span>{approvalSubmitLabel('reject', mode)}</span>
				)}
			</button>
		</fieldset>
	);
}

export function ApprovalDecisionForm({
	action,
	token,
	tokenFieldName = 'token',
	mode,
}: {
	action: DecideAction;
	token: string;
	tokenFieldName?: string;
	mode: ApprovalUiMode;
}) {
	const [activeDecision, setActiveDecision] = useState<ApprovalDecision | null>(null);

	return (
		<form action={action} className="grid gap-3" aria-label="Approval decision">
			<input type="hidden" name={tokenFieldName} value={token} />
			<ActionFieldset mode={mode} activeDecision={activeDecision} onSelect={setActiveDecision} />
		</form>
	);
}

function FormStatusAnnouncer({
	activeDecision,
	mode,
	pending,
}: {
	activeDecision: ApprovalDecision | null;
	mode: ApprovalUiMode;
	pending: boolean;
}) {
	if (!pending || !activeDecision) return null;
	return (
		<p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{approvalPendingLabel(activeDecision, mode)}
		</p>
	);
}
