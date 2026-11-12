export const WORKSPACE_STAGES = [
	{ id: 'brief', label: 'Brief' },
	{ id: 'research', label: 'Research' },
	{ id: 'draft', label: 'Draft' },
	{ id: 'review', label: 'Editorial Review' },
	{ id: 'images', label: 'Images' },
	{ id: 'seo', label: 'SEO' },
	{ id: 'publish', label: 'Publish' },
] as const;

export type WorkspaceStageId = (typeof WORKSPACE_STAGES)[number]['id'];

export type StageTone = 'complete' | 'attention' | 'pending';

export function isWorkspaceStage(value: string | null | undefined): value is WorkspaceStageId {
	return WORKSPACE_STAGES.some((stage) => stage.id === value);
}

export function workspaceStageFromLocation(search: string, stored: string | null): WorkspaceStageId {
	const requested = new URLSearchParams(search).get('stage');
	if (isWorkspaceStage(requested)) return requested;
	if (isWorkspaceStage(stored)) return stored;
	return 'draft';
}

/** Status comes from the workflow flags the article page already computes. */
export function stageTone(id: WorkspaceStageId, flags: {
	briefApproved: boolean;
	briefNeedsReapproval: boolean;
	researchApproved: boolean;
	researchChanged: boolean;
	hasDraft: boolean;
	reviewCurrent: boolean;
	reviewBlocked: boolean;
	imagesReady: boolean;
	seoReady: boolean;
	cmsCurrent: boolean;
}): StageTone {
	if (id === 'brief') return flags.briefNeedsReapproval ? 'attention' : flags.briefApproved ? 'complete' : 'pending';
	if (id === 'research') return flags.researchChanged ? 'attention' : flags.researchApproved ? 'complete' : 'pending';
	if (id === 'draft') return flags.hasDraft ? 'complete' : 'pending';
	if (id === 'review') return flags.reviewBlocked ? 'attention' : flags.reviewCurrent ? 'complete' : 'pending';
	if (id === 'images') return flags.imagesReady ? 'complete' : 'pending';
	if (id === 'seo') return flags.seoReady ? 'complete' : 'pending';
	return flags.cmsCurrent ? 'complete' : 'pending';
}

export const STAGE_TONE_LABEL: Record<StageTone, string> = {
	complete: 'Complete',
	attention: 'Needs attention',
	pending: 'Not finished',
};

const CATEGORY_LABEL: Record<string, string> = {
	search_intent: 'Search intent',
	usefulness: 'Usefulness',
	depth: 'Depth',
	accuracy: 'Accuracy',
	research: 'Research',
	brand: 'Brand positioning',
	product: 'Product claims',
	links: 'Links',
	citations: 'Citations',
	structure: 'Structure',
	repetition: 'Repetition',
	examples: 'Examples',
	seo: 'SEO',
	conversion: 'Conversion',
	writing: 'Writing',
	cms: 'Publication readiness',
};

export function findingTitle(category: string): string {
	return CATEGORY_LABEL[category] ?? 'Editorial note';
}

export function findingGroup(severity: 'critical' | 'major' | 'minor'): 'Blocking' | 'Important' | 'Suggested improvements' {
	if (severity === 'critical') return 'Blocking';
	if (severity === 'major') return 'Important';
	return 'Suggested improvements';
}

/** Returns a passage only when that exact text or heading is present in the article. */
export function passageAnchor(body: string, finding: { section: string | null; evidence: string[] }): string | null {
	const evidence = finding.evidence.map((item) => item.trim()).find((item) => item.length >= 12 && body.includes(item));
	if (evidence) return evidence;
	const section = finding.section?.trim();
	if (section && section.length >= 3 && body.includes(section)) return section;
	return null;
}
