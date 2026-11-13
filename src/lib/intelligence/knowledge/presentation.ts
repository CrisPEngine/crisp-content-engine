export type IntelligenceSection = 'overview' | 'brain' | 'strategy' | 'themes' | 'learnings' | 'diagnostics';

export function humanAvailability(value: string | undefined): string {
	switch (value) {
		case 'available':
			return 'Available';
		case 'beta':
			return 'Public beta';
		case 'private_preview':
			return 'Private preview';
		case 'in_development':
			return 'In development';
		case 'planned':
			return 'Planned';
		case 'deprecated':
		case 'discontinued':
			return 'No longer offered';
		default:
			return 'Not confirmed';
	}
}

export function humanVerification(value: string | undefined): string {
	switch (value) {
		case 'verified':
			return 'Verified';
		case 'evidence_outdated':
			return 'Evidence needs review';
		case 'disputed':
			return 'Disputed';
		case 'unverified':
			return 'Not verified';
		default:
			return 'Needs verification';
	}
}

export function humanProposalStatus(value: string | undefined): string {
	switch (value) {
		case 'approved':
			return 'Approved';
		case 'applied':
			return 'In Brand Brain';
		case 'rejected':
			return 'Rejected';
		case 'deferred':
			return 'Deferred';
		default:
			return 'Proposed';
	}
}

export function humanEvent(action: string): string {
	switch (action) {
		case 'verification_changed':
			return 'Verification updated';
		case 'applied_proposal':
			return 'Record added to Brand Brain';
		default:
			return 'Knowledge updated';
	}
}

export function nextIntelligenceAction(input: {
	verified: number;
	pendingProposals: number;
	strategyStatus: string | null;
	activeThemes: number;
	pendingLearnings: number;
}): { title: string; detail: string; section: IntelligenceSection; area?: string; filter?: string } {
	if (input.pendingProposals > 0) {
		return {
			title: 'Review proposed knowledge',
			detail: 'Approve the records you accept. Approval adds them to Brand Brain. It does not verify them.',
			section: 'brain',
			area: 'capabilities',
			filter: 'proposed',
		};
	}
	if (input.verified === 0) {
		return {
			title: 'Verify product capabilities',
			detail: 'Verified capabilities can be used as product facts. Availability limits still apply.',
			section: 'brain',
			area: 'capabilities',
			filter: 'needs-verification',
		};
	}
	if (!input.strategyStatus || input.strategyStatus === 'draft' || input.strategyStatus === 'missing') {
		return {
			title: 'Complete the brand strategy',
			detail: 'Review objectives, positioning, and content pillars. A generated draft stays inactive until you activate it.',
			section: 'strategy',
		};
	}
	if (input.pendingLearnings > 0) {
		return {
			title: 'Review pending learnings',
			detail: 'Accepted learnings can influence future writing. Proposed learnings do not.',
			section: 'learnings',
			filter: 'pending',
		};
	}
	if (input.activeThemes === 0) {
		return {
			title: 'Create the first content theme',
			detail: 'Themes give articles a subject without changing verified product facts.',
			section: 'themes',
		};
	}
	return {
		title: 'Test this knowledge in an article',
		detail: 'Open the article workspace for this brand. An editorial review reads verified capabilities and does not rewrite the draft.',
		section: 'overview',
	};
}
