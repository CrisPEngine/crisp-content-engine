import type { AvailabilityStatus, VerificationStatus } from './types';

/**
 * Candidates drawn from the public Folian site (https://folian.app) on 13 Nov 2026.
 * None of these are verified. The page is vendor marketing, not product documentation
 * or a release record. A feature named only in an internal brief is omitted when the
 * page does not mention it.
 */
export const FOLIAN_SITE_RETRIEVED_AT = '2026-11-13';
export const FOLIAN_SITE_URL = 'https://folian.app';
export const FOLIAN_SESSION_KEY = 'folian-official-site-2026-11-13';

export type CatalogueDraft = {
	recordType: 'product' | 'capability' | 'claim';
	naturalKey: string;
	name: string;
	description: string;
	availability: AvailabilityStatus;
	verificationStatus: VerificationStatus;
	evidence: string;
	platform?: string;
	implementationEvidence?: string;
	qaEvidence?: string;
	publicReleaseEvidence?: string;
	recommendation?: string;
	limitations?: string;
	prohibited?: boolean;
	category?: string;
	commercialModel?: string;
};

const page = 'Public website https://folian.app, retrieved 13 Nov 2026. Marketing copy, not a release record.';
const mac = 'Current public Mac beta is 0.1.0-beta.14, published 21 Oct 2026 on https://config.folian.app/desktop/beta/darwin-arm64.json and GitHub ABLint/folian-config release v0.1.0-beta.14. Apple Silicon, macOS 12 or later. The July 2026 beta.4 feed is historical.';

export function folianOfficialSiteDrafts(): CatalogueDraft[] {
	const capability = (
		naturalKey: string,
		name: string,
		description: string,
		availability: AvailabilityStatus,
		platform: string,
		implementationEvidence: string,
		qaEvidence: string,
		publicReleaseEvidence: string,
		recommendation: string,
		limitations?: string,
	): CatalogueDraft => ({
		recordType: 'capability',
		naturalKey,
		name,
		description,
		availability,
		verificationStatus: 'verification_required',
		evidence: publicReleaseEvidence,
		platform,
		implementationEvidence,
		qaEvidence,
		publicReleaseEvidence,
		recommendation,
		limitations,
		category: 'writing',
	});

	const desk = 'Folian for Mac';
	const impl = 'Shared Folian desktop and Studio source in ABLint/Folian. Present in the source used for the signed beta.14 candidate.';
	return [
		{
			recordType: 'product',
			naturalKey: 'product:folian-for-mac',
			name: 'Folian for Mac',
			description: 'Folian for Mac is a local-first writing application in public beta for Apple Silicon Macs running macOS 12 or later.',
			availability: 'beta',
			verificationStatus: 'verification_required',
			evidence: mac,
			platform: 'macOS arm64',
			implementationEvidence: 'Electron desktop app in ABLint/Folian. Signed candidate source commit 51ee2e4, recorded in docs/releases/BETA14_FINAL_MACOS_RELEASE.md.',
			qaEvidence: 'Signed RC2 native QA on 21 Oct 2026 covered manuscript persistence, Story Bible surfaces, export, recovery, and an existing active licence. RC1 was rejected after a Timeline crash and was not published.',
			publicReleaseEvidence: mac,
			recommendation: 'Approve, then verify as the current public Mac beta. Do not describe it as a finished 1.0 release.',
			category: 'desktop software',
			commercialModel: 'one-time purchase',
		},
		{
			recordType: 'product',
			naturalKey: 'product:folian-studio',
			name: 'Folian Studio',
			description: 'Folian Studio is an invite-only cloud workspace. It is separate from the Mac app and is not part of the public Mac download.',
			availability: 'private_preview',
			verificationStatus: 'verification_required',
			evidence: `${page} The public site still says “Folian Studio: Planned separately.” Engineering records describe an invite-only workspace at studio.folian.app.`,
			platform: 'Web, invite only',
			implementationEvidence: 'Same shared writing source as the Mac app, with cloud sign-in and hosted storage. docs/FOLIAN_STUDIO_PRIVATE_PREVIEW.md.',
			qaEvidence: 'Hosted manual review was recorded against source 97c58ef. Later shared corrections were not certified as deployed to the public Studio domain.',
			publicReleaseEvidence: 'No public Studio release. The public website still says Studio is planned separately.',
			recommendation: 'Keep as private preview. Do not verify it as a public Mac feature or as a publicly available product.',
			category: 'private preview',
			limitations: 'Do not describe Studio features as included in the Mac download. Do not say the public website offers Studio today.',
		},
		capability('capability:manuscript-writing', 'Manuscript writing', 'Write a manuscript in chapters and scenes, with notes kept in the same project.', 'beta', desk, impl, 'Signed RC2 QA persisted a manuscript edit across quit and relaunch.', `${mac} Public notes describe manuscript navigation, autosave history from beta 12, and recovery.`, 'Approve, then verify for Folian for Mac public beta.', 'Does not claim a particular word-processor file is the stored manuscript.'),
		capability('capability:story-bible', 'Story Bible', 'Keep characters, locations, relationships, canon, and timeline records with the manuscript.', 'beta', desk, impl, 'Signed RC2 opened characters, locations, relationships, canon, and timeline after upgrading a beta 13 project.', `${mac} Public notes describe deeper Story Bible development.`, 'Approve, then verify for Folian for Mac. Do not say Studio is included.'),
		capability('capability:characters-and-places', 'Characters', 'Create character records and review AI suggestions before anything is saved into the story.', 'beta', desk, impl, 'Signed RC2 character QA covered proposals, individual and batch acceptance, rejection, and reload.', `${mac} Public notes name AI-assisted character development. Suggestions stay reviewable.`, 'Approve, then verify for Folian for Mac.', 'AI proposes. It does not change a character until the writer accepts the suggestion.'),
		capability('capability:locations', 'Locations', 'Create location records and review suggested changes before they are saved.', 'beta', desk, impl, 'Signed RC2 entity QA covered multiple locations and selective acceptance.', `${mac} Public notes name locations in AI-assisted Story Bible development.`, 'Approve, then verify for Folian for Mac.', 'This is separate from the Characters record. Do not collapse them into one claim.'),
		capability('capability:relationships', 'Relationships', 'Record relationships between story entities and review suggested changes before they are saved.', 'beta', desk, impl, 'Signed RC2 entity QA included Relationships.', `${mac} Public notes name relationships in AI-assisted Story Bible development.`, 'Approve, then verify for Folian for Mac.', 'Numeric relationship values are preserved. Folian does not invent a score on its own.'),
		capability('capability:canon', 'Canon', 'Record established story facts and keep proposed or conflicting notes separate until the writer accepts them.', 'beta', desk, impl, 'Signed RC2 opened Canon records from an upgraded project.', `${mac} Public notes name canon in Story Bible development.`, 'Approve, then verify for Folian for Mac.', 'Do not say Folian guarantees a contradiction-free manuscript.'),
		capability('capability:timelines', 'Timeline', 'Build a project timeline and keep events with the manuscript.', 'beta', desk, impl, 'Signed RC2 Timeline QA covered missing, empty, and populated event links, including records created by beta 13. RC1 crashed on a missing link and was not published.', `${mac} Public notes name Timeline in Story Bible development.`, 'Approve, then verify for the published beta 14 build only.', 'Do not describe the rejected RC1 candidate as the public release.'),
		capability('capability:planning', 'Planning and outlining', 'Plan with a story map, chapter briefs, and an outliner beside the manuscript.', 'beta', desk, impl, 'Signed RC2 QA covered Story Map, Pinboard, Outliner, and chapter field proposals.', `${mac} Public notes describe chapter planning, briefs, and inline decisions.`, 'Approve, then verify for Folian for Mac.'),
		capability('capability:research', 'Research', 'Keep research sources and notes with the project, separate from established story facts.', 'beta', desk, impl, 'Desktop test chain included a Research handoff. Beta 12 public notes already separated research from established facts.', `${mac} Research remains in the product carried forward to beta 14.`, 'Approve, then verify for Folian for Mac.', 'Research notes are not automatically treated as canon.'),
		capability('capability:decisions', 'Decisions', 'Save a creative or editorial decision and reopen it later.', 'beta', desk, impl, 'Signed RC2 chapter QA saved one decision through one approval and reloaded it.', `${mac} Public notes describe inline decisions that save once.`, 'Approve, then verify for Folian for Mac.'),
		capability('capability:ask-folian', 'Ask Folian', 'Ask a question about the current project and see the sources used in the answer.', 'beta', desk, 'Ask Folian is a shared assistant surface in the Folian source. Public beta documentation names it in the product guides.', 'Automated context and source tests passed during the public-beta release candidate. A fresh paid-provider production smoke was not part of the beta 14 native matrix.', 'The beta 14 public notes describe editing and history. They do not use the name Ask Folian.', 'Approve only if the customer-facing name should be Ask Folian. Verify after checking the installed beta 14 app still shows that name.', 'Ask Folian does not edit the manuscript by itself. Do not describe it as a chatbot product.'),
		capability('capability:ai-assisted-editing', 'AI-assisted editing', 'Review a passage, edit a suggestion, and apply only the changes you accept.', 'beta', desk, impl, 'Signed RC2 Editing and History QA covered source switching, proposal review, apply, and snapshot restore.', `${mac} Public notes say editing follows the selected chapter or scene and that AI suggestions remain reviewable.`, 'Approve, then verify for Folian for Mac.', 'Do not describe this as an automatic rewrite or a ghostwriter.'),
		capability('capability:editorial-review', 'Editorial review', 'Review a passage against the selected chapter or scene and keep the proposal separate until it is accepted.', 'beta', desk, impl, 'Signed RC2 QA covered source-aware History and stale proposal guards.', `${mac} Public notes describe source-aware History and safer proposal review.`, 'Approve, then verify as editorial review.', 'There is no separate product feature named continuity analysis. Do not claim Folian detects every continuity error.'),
		capability('capability:optional-ai', 'Optional AI and your own API key', 'Writing works without AI. When AI is used, it can use the writer’s own API key.', 'beta', desk, 'Desktop stores the provider key locally. Studio uses an account or project key. The two stores are separate.', 'Beta 14 native QA used deterministic provider fixtures. An existing encrypted key survived restart. No new live provider call was made in that release check.', `${page} “No AI is required for the core writing system.” ${mac}`, 'Approve, then verify for Folian for Mac.', 'Do not describe Folian as an AI ghostwriter or as requiring a subscription to an AI provider.'),
		capability('capability:local-first', 'Local-first storage', 'The Mac app keeps the manuscript, project files, and backups on the Mac.', 'beta', desk, 'Desktop uses a local database. Studio uses hosted storage. Projects do not sync automatically.', 'Signed RC2 upgraded a beta 13 project locally. Table checks matched before and after restart.', `${mac} Public notes describe local files, recovery backups, and a separate portable project archive. ${page}`, 'Approve, then verify for Folian for Mac.', 'Do not say a Studio project is stored on the Mac, or that a Mac project appears in Studio.'),
		capability('capability:export', 'Export', 'Export a full manuscript, a chapter, a chapter range, or a scene as DOCX or Markdown.', 'beta', desk, impl, 'Signed RC2 export QA opened DOCX and checked Markdown for the full manuscript and the current chapter.', `${mac} Public notes name DOCX and Markdown for those scopes.`, 'Approve, then verify those two formats for Folian for Mac.', 'Do not claim PDF, EPUB, or screenplay export. PDF remains a browser-print handoff, not a new file format.'),
		capability('capability:desktop-licensing', 'Desktop licensing', 'A purchased Folian licence can be used on up to two Macs and keeps working offline after activation.', 'beta', desk, 'Licensing is desktop-only. Studio has no equivalent activation gate.', '23 deterministic licensing tests passed. Signed RC2 recognised an existing active licence on launch and restart. A new live activation was not performed in that check.', 'Introduced in public beta 13 on 9 Oct 2026 and retained in beta 14. https://github.com/ABLint/folian-config/releases/tag/v0.1.0-beta.13', 'Approve, then verify for Folian for Mac.', 'Do not claim a freshly purchased copy was activated during the beta 14 check. Checkout behaviour was not retested here.'),
		capability('capability:windows', 'Windows', 'A Windows version is in development. It is not a current public download.', 'in_development', 'Windows', 'The repository has a Windows packaging workflow. The June 2026 readiness report said it was not ready for a public beta.', 'No signed public Windows installer was verified for beta 14. The beta 14 Mac release scope excluded Windows.', `${page} “Windows: In development.”`, 'Keep in development. Do not verify it as available.', 'Do not offer a Windows download or a Windows release date.'),
		{
			recordType: 'claim',
			naturalKey: 'claim:one-time-purchase',
			name: 'One-time Mac purchase during beta',
			description: 'Folian for Mac is $30 as a one-time purchase during beta. It is not a subscription. The launch price will be $49.',
			availability: 'beta',
			verificationStatus: 'verification_required',
			evidence: `${page} Pricing FAQ.`,
			category: 'commercial',
			limitations: 'Price is dated to this page retrieval and can change.',
		},
		{
			recordType: 'claim',
			naturalKey: 'claim:not-a-generator',
			name: 'Prohibited: AI ghostwriter',
			description: 'Do not describe Folian as an AI writing tool that replaces the author, or as guaranteeing a contradiction-free manuscript.',
			availability: 'available',
			verificationStatus: 'verification_required',
			evidence: `${page} “Not a document. Not a chatbot. Not a generator.” AI is described as optional.`,
			prohibited: true,
			category: 'prohibited',
		},
	];
}

export function isFolianOfficialSite(website: string | undefined): boolean {
	if (!website) return false;
	try {
		const host = new URL(website).hostname.replace(/^www\./, '');
		return host === 'folian.app';
	} catch {
		return false;
	}
}
