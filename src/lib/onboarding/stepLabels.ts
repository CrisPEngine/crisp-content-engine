const STEP_LABELS: Record<string, string> = {
	strategy: 'Review brand strategy in Intelligence',
	connections: 'Connect publishing channels',
	assets: 'Upload brand assets',
	agents: 'Connect an assistant (all brands recommended)',
	questionnaire: 'Complete brand questionnaire',
	approve_strategy: 'Approve your content strategy',
	generate_content: 'Generate content for your channels',
	connect_social: 'Connect social accounts',
	review_content: 'Review and approve drafts',
	'Review-brand-strategy-in-intelligence': 'Review brand strategy in Intelligence',
};

export function humanStepLabel(stepId: string, fallback?: string): string {
	if (STEP_LABELS[stepId]) return STEP_LABELS[stepId];
	if (fallback?.trim()) return fallback.trim();
	const words = stepId
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
	return words || 'Next step';
}
