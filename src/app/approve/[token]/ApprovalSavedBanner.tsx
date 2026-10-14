import { CheckCircle2 } from 'lucide-react';

export function ApprovalSavedBanner() {
	return (
		<div
			className="card flex items-start gap-3 border border-accent/40 bg-accent/10 p-4 text-text"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
			<div>
				<p className="font-medium">Saved</p>
				<p className="mt-1 text-sm text-text-soft">Your edits are stored on this draft. You can keep editing or approve when ready.</p>
			</div>
		</div>
	);
}
