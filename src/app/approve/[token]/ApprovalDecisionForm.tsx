'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
	approvalPendingLabel,
	approvalSubmitLabel,
	type ApprovalDecision,
} from './approvalFeedback';

const pressableButton =
	'touch-manipulation select-none transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-60';

type DecideAction = (formData: FormData) => void | Promise<void>;

function ActionFieldset({
	schedule,
	activeDecision,
	onSelect,
}: {
	schedule: boolean;
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
			<FormStatusAnnouncer activeDecision={activeDecision} schedule={schedule} pending={pending} />
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
						<span>{approvalPendingLabel('approve', schedule)}</span>
					</>
				) : (
					<span>{approvalSubmitLabel('approve', schedule)}</span>
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
						<span>{approvalPendingLabel('reject', schedule)}</span>
					</>
				) : (
					<span>{approvalSubmitLabel('reject', schedule)}</span>
				)}
			</button>
		</fieldset>
	);
}

export function ApprovalDecisionForm({
	action,
	token,
	schedule,
}: {
	action: DecideAction;
	token: string;
	schedule: boolean;
}) {
	const [activeDecision, setActiveDecision] = useState<ApprovalDecision | null>(null);

	return (
		<form action={action} className="grid gap-3" aria-label="Approval decision">
			<input type="hidden" name="token" value={token} />
			<ActionFieldset
				schedule={schedule}
				activeDecision={activeDecision}
				onSelect={setActiveDecision}
			/>
		</form>
	);
}

function FormStatusAnnouncer({
	activeDecision,
	schedule,
	pending,
}: {
	activeDecision: ApprovalDecision | null;
	schedule: boolean;
	pending: boolean;
}) {
	if (!pending || !activeDecision) return null;
	return (
		<p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{approvalPendingLabel(activeDecision, schedule)}
		</p>
	);
}
