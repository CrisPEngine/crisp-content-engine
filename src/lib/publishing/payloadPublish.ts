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

export function livePageMatches(html: string, expected: { title: string; description?: string | null; canonicalUrl?: string | null; heroUrl?: string | null; bodyExcerpt?: string | null }): { ok: boolean; problems: string[]; retryPublication: false } {
	const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
	const description = html.match(/name="description" content="([^"]*)"/i)?.[1]?.trim() ?? '';
	const canonical = html.match(/rel="canonical" href="([^"]+)"/i)?.[1] ?? html.match(/property="og:url" content="([^"]+)"/i)?.[1] ?? '';
	const problems: string[] = [];
	const wanted = expected.title.trim();
	if (wanted && !title.toLowerCase().includes(wanted.toLowerCase().slice(0, 24))) problems.push('title');
	if (expected.description && description !== expected.description) problems.push('description');
	if (expected.canonicalUrl && canonical && canonical !== expected.canonicalUrl) problems.push('canonical');
	if (expected.heroUrl && !html.includes(expected.heroUrl)) problems.push('hero');
	if (expected.bodyExcerpt && !html.includes(expected.bodyExcerpt.slice(0, 40))) problems.push('body');
	return { ok: problems.length === 0, problems, retryPublication: false };
}

export function publicationQualityGate(input: {
	approved: boolean;
	researchApproved: boolean;
	criticalOpen: number;
	materialOpen: string[];
	seoReady: boolean;
	heroRequired: boolean;
	heroReady: boolean;
	externalId: string | null;
	expectedRevision: number | null;
	currentRevision: number | null;
}): { ok: true } | { ok: false; message: string } {
	if (!input.approved) return { ok: false, message: 'A person has to approve the article before it can be published.' };
	if (!input.researchApproved) return { ok: false, message: 'Approved research is required before publication.' };
	if (input.criticalOpen > 0) return { ok: false, message: 'Unresolved critical findings remain.' };
	if (input.materialOpen.length) return { ok: false, message: `Significant findings are still open: ${input.materialOpen.join(', ')}.` };
	if (!input.seoReady) return { ok: false, message: 'SEO title and description are required before publication.' };
	if (input.heroRequired && !input.heroReady) return { ok: false, message: 'A verified hero image is required before publication.' };
	if (!input.externalId) return { ok: false, message: 'The article has no Payload external id.' };
	if (input.expectedRevision != null && input.currentRevision != null && input.expectedRevision !== input.currentRevision) {
		return { ok: false, message: 'Payload has a newer revision. Revalidate and approve again before publishing.' };
	}
	return { ok: true };
}

export async function runGuardedPublish(input: {
	approved: boolean;
	researchApproved: boolean;
	criticalOpen: number;
	materialOpen: string[];
	seoReady: boolean;
	heroRequired: boolean;
	heroReady: boolean;
	externalId: string | null;
	expectedRevision: number | null;
	explicit: boolean;
	liveEnabled: boolean;
	autoPublish: boolean;
	title: string;
	description: string;
	client?: {
		read: () => Promise<{ status: number; body: Record<string, unknown> }>;
		publish: (revision: number) => Promise<{ status: number; body: Record<string, unknown> }>;
		page?: (url: string) => Promise<string>;
	};
}): Promise<{ sent: boolean; phase: PublicationPhase; message: string; retryPublication: false }> {
	const gate = publicationQualityGate({ ...input, currentRevision: null });
	if (!gate.ok) return { sent: false, phase: input.approved ? 'failed' : 'ready_for_approval', message: gate.message, retryPublication: false };
	const decision = publishDecision({ approved: input.approved, blockers: input.materialOpen, liveEnabled: input.liveEnabled, explicit: input.explicit, autoPublish: input.autoPublish });
	if (!decision.allow) return { sent: false, phase: decision.phase, message: decision.message, retryPublication: false };
	if (!input.client || !input.externalId) return { sent: false, phase: 'approved', message: 'Live publishing is disabled. Payload was not called.', retryPublication: false };
	let current;
	try {
		current = await input.client.read();
	} catch {
		return { sent: false, phase: 'failed', message: 'Payload could not be read. Nothing was published.', retryPublication: false };
	}
	const publication = current.body.publication && typeof current.body.publication === 'object' ? current.body.publication as Record<string, unknown> : current.body;
	const currentRevision = typeof publication.revision === 'number' ? publication.revision : null;
	const currentTitle = typeof publication.title === 'string' ? publication.title : input.title;
	const currentDescription = typeof publication.dek === 'string' ? publication.dek : input.description;
	if (current.status === 401 || current.status === 403 || current.body.code === 'unauthorized') {
		return { sent: false, phase: 'failed', message: 'Payload rejected the publishing credentials. Nothing was published.', retryPublication: false };
	}
	if (input.expectedRevision != null && currentRevision != null && input.expectedRevision !== currentRevision) {
		return { sent: false, phase: 'failed', message: staleRevisionDecision({ expectedRevision: input.expectedRevision, currentRevision, sameTitle: currentTitle === input.title, sameDescription: currentDescription === input.description }).message, retryPublication: false };
	}
	const revision = currentRevision ?? input.expectedRevision;
	if (revision == null) return { sent: false, phase: 'failed', message: 'Payload did not return a revision, so nothing was published.', retryPublication: false };
	let response;
	try {
		response = await input.client.publish(revision);
	} catch {
		return { sent: false, phase: 'failed', message: 'The publish request failed before Payload responded. It was not retried.', retryPublication: false };
	}
	const outcome = interpretPublishResponse(response.status, response.body);
	if (outcome.code === 'stale_revision' || outcome.code === 'idempotency_conflict') {
		return { sent: false, phase: 'failed', message: outcome.message, retryPublication: false };
	}
	if (!outcome.ok) return { sent: true, phase: 'failed', message: outcome.message, retryPublication: false };
	if (outcome.canonicalUrl && input.client.page) {
		try {
			const html = await input.client.page(outcome.canonicalUrl);
			const verified = livePageMatches(html, { title: input.title, description: input.description, canonicalUrl: outcome.canonicalUrl });
			if (!verified.ok) {
				return { sent: true, phase: 'published', message: `Payload published revision ${outcome.revision ?? revision}. The public page is not showing ${verified.problems.join(', ')} yet, so publication was not retried.`, retryPublication: false };
			}
		} catch {
			return { sent: true, phase: 'published', message: 'Payload published the revision. The public page could not be read yet, so publication was not retried.', retryPublication: false };
		}
		return { sent: true, phase: 'verified_live', message: outcome.message, retryPublication: false };
	}
	return { sent: outcome.published, phase: outcome.phase, message: outcome.message, retryPublication: false };
}

export function staleRevisionDecision(input: { expectedRevision: number; currentRevision: number; sameTitle: boolean; sameDescription: boolean }): { overwrite: false; revalidationRequired: boolean; message: string } {
	const changed = input.expectedRevision !== input.currentRevision || !input.sameTitle || !input.sameDescription;
	return {
		overwrite: false,
		revalidationRequired: changed,
		message: changed
			? `Payload revision ${input.currentRevision} is newer than approved revision ${input.expectedRevision}. It was not overwritten.`
			: 'The Payload revision matches the approved proposal.',
	};
}
