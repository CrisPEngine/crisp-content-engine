import { CheckCircle2, AlertCircle } from 'lucide-react';
import {
	approvalSuccessDetail,
	approvalSuccessHeadline,
} from './approvalFeedback';

export function ApprovalStatusBanner({
	done,
	error,
	schedule,
}: {
	done?: string;
	error?: string;
	schedule: boolean;
}) {
	if (done) {
		return (
			<div
				className="card flex items-start gap-3 border border-accent/40 bg-accent/10 p-4 text-text"
				role="status"
				aria-live="polite"
				aria-atomic="true"
			>
				<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
				<div>
					<p className="font-medium">{approvalSuccessHeadline(done, schedule)}</p>
					<p className="mt-1 text-sm text-text-soft">{approvalSuccessDetail(done)}</p>
				</div>
			</div>
		);
	}
	if (error) {
		return (
			<div
				className="card flex items-start gap-3 border border-danger/40 bg-danger/10 p-4 text-danger"
				role="alert"
				aria-live="assertive"
				aria-atomic="true"
			>
				<AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
				<p className="text-sm">{error}</p>
			</div>
		);
	}
	return null;
}
