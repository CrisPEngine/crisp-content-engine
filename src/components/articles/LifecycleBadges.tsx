export type Lifecycle = {
	savedInCce: boolean;
	revisionNumber: number | null;
	submittedToCms: boolean;
	cmsCurrent: boolean;
	approved: boolean;
	scheduled: boolean;
	published: boolean;
};

function Badge({ on, label, title }: { on: boolean; label: string; title: string }) {
	return (
		<span
			title={title}
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${on ? 'border-accent/60 bg-accent/15 text-text' : 'border-edge text-text-dim'}`}
		>
			{on ? '✓ ' : ''}{label}
		</span>
	);
}

export function LifecycleBadges({ lifecycle }: { lifecycle: Lifecycle }) {
	return (
		<div className="flex flex-wrap gap-2" aria-label="Article status">
			<Badge on={lifecycle.savedInCce} label={lifecycle.revisionNumber ? `Saved in CCE · revision ${lifecycle.revisionNumber}` : 'Saved in CCE'} title="The article body is stored in CCE." />
			<Badge
				on={lifecycle.submittedToCms}
				label={lifecycle.submittedToCms && !lifecycle.cmsCurrent ? 'Submitted to CMS · older revision' : 'Submitted to CMS'}
				title="A draft has been sent to the website CMS. It is not published."
			/>
			<Badge on={lifecycle.approved} label="Approved" title="A person approved this revision." />
			<Badge on={lifecycle.scheduled} label="Scheduled" title="A publication time is recorded. Publishing still happens in the CMS." />
			<Badge on={lifecycle.published} label="Published" title="The published URL was recorded after publishing in the CMS." />
		</div>
	);
}
