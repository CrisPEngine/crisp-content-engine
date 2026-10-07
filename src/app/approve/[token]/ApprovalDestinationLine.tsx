import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ApprovalDestinationView } from '@/lib/agent/approvalDestination';

export function ApprovalDestinationLine({
	destination,
	hideWhenScheduledSuccess,
}: {
	destination: ApprovalDestinationView;
	hideWhenScheduledSuccess?: boolean;
}) {
	if (hideWhenScheduledSuccess && destination.publishQueued) {
		return (
			<p className="flex items-start gap-2 text-sm text-text">
				<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
				<span>{destination.message}</span>
			</p>
		);
	}

	if (destination.ready && !destination.publishQueued) {
		return (
			<p className="flex items-start gap-2 text-sm text-text">
				<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
				<span>{destination.message}</span>
			</p>
		);
	}

	if (!destination.ready) {
		return (
			<p className="flex items-start gap-2 text-sm text-danger" role="status">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
				<span>{destination.message}</span>
			</p>
		);
	}

	return <p className="text-sm text-text">{destination.message}</p>;
}
