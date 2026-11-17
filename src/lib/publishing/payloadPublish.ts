export type PublicationPhase =
	| 'ready_for_approval'
	| 'approved'
	| 'scheduled'
	| 'publishing'
	| 'published'
	| 'verified_live'
	| 'failed';

export type PublishCommand = {
	externalId: string;
	baseRevision: number;
	baseUpdatedAt?: string | null;
	publishAt?: string | null;
	idempotencyKey: string;
};

export type MetadataCommand = PublishCommand & {
	title?: string;
	description?: string;
	seoTitle?: string;
	seoDescription?: string;
	heroMediaId?: string | null;
};

export type PublishOutcome = {
	ok: boolean;
	phase: PublicationPhase;
	duplicate: boolean;
	published: boolean;
	canonicalUrl: string | null;
	revision: number | null;
	code: string | null;
	message: string;
};

const MATERIAL_FINDINGS = new Set([
	'intro-weak',
	'opening-guide',
	'definition-thin',
	'cta-weak',
	'answers-indirect',
	'example-conflict',
]);

export function materialFindingIds(): string[] {
	return [...MATERIAL_FINDINGS];
}

export function usefulnessBlockers(findings: Array<{ id: string; status: string; severity: string; category?: string }>): string[] {
	return findings
		.filter((finding) => finding.status === 'open' && (finding.severity === 'critical' || MATERIAL_FINDINGS.has(finding.id) || finding.category === 'repetition' || finding.category === 'structure'))
		.map((finding) => finding.id);
}

export function derivePublicationPhase(input: {
	stored: PublicationPhase | null;
	approval: string;
	articleStatus: string;
	scheduleStatus: string | null;
	blockers: string[];
}): PublicationPhase {
	if (input.stored === 'publishing' || input.stored === 'failed' || input.stored === 'verified_live' || input.stored === 'published') return input.stored;
	if (input.scheduleStatus === 'scheduled' || input.scheduleStatus === 'due') return 'scheduled';
	if (input.approval === 'approved' && (input.articleStatus === 'approved' || input.articleStatus === 'published')) return 'approved';
	return 'ready_for_approval';
}

export function publishDecision(input: {
	approved: boolean;
	blockers: string[];
	liveEnabled: boolean;
	explicit: boolean;
	autoPublish: boolean;
}): { allow: false; phase: 'failed' | 'ready_for_approval' | 'approved'; message: string } | { allow: true } {
	if (!input.explicit || input.autoPublish) {
		return { allow: false, phase: input.approved ? 'approved' : 'ready_for_approval', message: 'Approval does not publish. Automatic publishing is off.' };
	}
	if (!input.approved) return { allow: false, phase: 'ready_for_approval', message: 'A person has to approve the article before it can be published.' };
	if (input.blockers.length) {
		return { allow: false, phase: 'failed', message: `Publication is blocked until these findings are resolved: ${input.blockers.join(', ')}.` };
	}
	if (!input.liveEnabled) return { allow: false, phase: 'approved', message: 'The article is approved. Live publishing is disabled, so Payload was not called.' };
	return { allow: true };
}

export function interpretPublishResponse(status: number, body: Record<string, unknown>): PublishOutcome {
	const publication = body.publication && typeof body.publication === 'object' ? body.publication as Record<string, unknown> : null;
	const code = typeof body.code === 'string' ? body.code : null;
	const canonicalUrl = typeof publication?.canonicalUrl === 'string' ? publication.canonicalUrl : null;
	const revision = typeof publication?.revision === 'number' ? publication.revision : typeof body.currentRevision === 'number' ? body.currentRevision : null;
	if (status === 200 && body.ok === true) {
		const scheduled = publication?.scheduleState === 'pending';
		const live = body.published === true || publication?.live === true;
		return {
			ok: true,
			phase: scheduled ? 'scheduled' : live ? 'published' : 'approved',
			duplicate: body.duplicate === true,
			published: live,
			canonicalUrl,
			revision,
			code,
			message: body.duplicate === true ? 'Payload returned the existing publication. It was not written again.' : scheduled ? 'Payload scheduled the approved revision.' : live ? 'Payload published the approved revision.' : 'Payload accepted the publication request.',
		};
	}
	const message = typeof body.message === 'string' ? body.message : code === 'automated_publish_disabled' ? 'Folian automated publishing is disabled.' : code === 'stale_revision' ? 'Payload changed after this revision. The article was not written.' : `Payload returned ${status}.`;
	return { ok: false, phase: 'failed', duplicate: false, published: false, canonicalUrl, revision, code, message };
}

export function livePageMatches(html: string, expected: { title: string; description?: string | null }): { ok: boolean; problems: string[] } {
	const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
	const description = html.match(/name="description" content="([^"]*)"/i)?.[1]?.trim() ?? '';
	const problems: string[] = [];
	const wanted = expected.title.trim();
	if (wanted && !title.toLowerCase().includes(wanted.toLowerCase().slice(0, 24))) problems.push('title');
	if (expected.description && description !== expected.description) problems.push('description');
	return { ok: problems.length === 0, problems };
}
