const TONE: Record<string, string> = {
	success: 'border-success/60 bg-success/15 text-text',
	warning: 'border-review/70 bg-review/15 text-text',
	danger: 'border-danger/70 bg-danger/15 text-text',
	info: 'border-info/60 bg-info/15 text-text',
	neutral: 'border-edge bg-bg text-text-soft',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONE }) {
	return (
		<span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE[tone] ?? TONE.neutral}`}>
			<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
			{label}
		</span>
	);
}

export function toneForStatus(label: string): keyof typeof TONE {
	const value = label.toLowerCase();
	if (value.startsWith('none') || value.startsWith('not ')) return 'neutral';
	if (value.includes('fail') || value.includes('error')) return 'danger';
	if (value.includes('paused') || value.includes('attention') || value.includes('waiting') || value.includes('partial') || value.includes('review required')) return 'warning';
	if (value === 'running' || value === 'queued') return 'info';
	if (value.includes('published') || value === 'complete' || value === 'completed' || value === 'available' || value === 'active' || value === 'approved') return 'success';
	return 'neutral';
}
