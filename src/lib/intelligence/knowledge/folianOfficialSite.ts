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
	limitations?: string;
	prohibited?: boolean;
	category?: string;
	commercialModel?: string;
};

const page = 'Stated on https://folian.app on 13 Nov 2026. Not independently verified.';
const release = 'Release feed https://github.com/ABLint/folian-updates desktop/beta/darwin-arm64.json, Folian 0.1.0-beta.4, published 26 Jul 2026. The feed is independent of Folian Studio.';

export function folianOfficialSiteDrafts(): CatalogueDraft[] {
	const capability = (
		naturalKey: string,
		name: string,
		description: string,
		availability: AvailabilityStatus,
		evidence: string,
		limitations?: string,
	): CatalogueDraft => ({
		recordType: 'capability',
		naturalKey,
		name,
		description,
		availability,
		verificationStatus: 'verification_required',
		evidence,
		limitations,
		category: 'writing',
	});

	return [
		{
			recordType: 'product',
			naturalKey: 'product:folian-for-mac',
			name: 'Folian for Mac',
			description: 'Local-first desktop writing application for Mac, described as available in public beta.',
			availability: 'beta',
			verificationStatus: 'verification_required',
			evidence: `${page} The page says Mac public beta is available to purchase and download. ${release}`,
			category: 'desktop software',
			commercialModel: 'one-time purchase',
		},
		{
			recordType: 'product',
			naturalKey: 'product:folian-studio',
			name: 'Folian Studio',
			description: 'The public site lists Folian Studio as planned separately from the Mac app.',
			availability: 'planned',
			verificationStatus: 'verification_required',
			evidence: `${page} “Folian Studio: Planned separately.” ${release}`,
			category: 'planned product',
			limitations: 'Do not describe Studio as part of the current Mac download.',
		},
		capability(
			'capability:manuscript-writing',
			'Manuscript writing',
			'The site describes drafting scenes with chapter structure, notes, and project context in one workspace.',
			'beta',
			`${page} “Draft scenes with chapter structure, notes and project context close at hand.”`,
		),
		capability(
			'capability:story-bible',
			'Story Bible',
			'The site says characters, places, and world rules stay connected to the manuscript.',
			'beta',
			`${page} FAQ: “Folian includes a story bible and canon workspace for characters, places, world rules and continuity.”`,
		),
		capability(
			'capability:characters-and-places',
			'Characters and places',
			'The site groups characters and places inside the story bible. It does not name separate profile or relationship editors.',
			'beta',
			`${page} “Track characters, places, rules and continuity.”`,
			'Relationship management is not named on this page.',
		),
		capability(
			'capability:canon',
			'Canon',
			'The site describes recording story rules and creative choices so a long project does not contradict itself later.',
			'beta',
			`${page} “Folian’s canon and decisions workspaces let you record the rules and creative choices behind a manuscript.”`,
			'The page does not say Folian guarantees a contradiction-free manuscript.',
		),
		capability(
			'capability:timelines',
			'Timelines',
			'The page lists timelines among the things a long manuscript requires. It does not document a timeline editor.',
			'unverified',
			`${page} Opening section: authors manage “research, timelines, creative decisions and revision notes.”`,
			'Not named as a separate current feature. Do not describe a timeline product until documentation confirms it.',
		),
		capability(
			'capability:planning',
			'Planning',
			'The site mentions chapter planning and keeping manuscript structure with the draft.',
			'beta',
			`${page} Novelists are described as using Folian for “drafting, chapter planning, revision and long-form manuscript control.”`,
		),
		capability(
			'capability:research',
			'Research organisation',
			'The site says research and editorial notes can stay attached to the project.',
			'beta',
			`${page} “Keep research and editorial notes attached to the project instead of scattered across tabs.”`,
		),
		capability(
			'capability:optional-ai',
			'Optional AI',
			'The site says AI is optional, uses the author’s own API key, and is not required to write.',
			'beta',
			`${page} “No AI is required for the core writing system.” ${release} The beta 4 notes mention a remote AI model catalogue, validated offline fallback, and preserved API keys.`,
			'Do not describe Folian as an AI ghostwriter or as requiring AI.',
		),
		capability(
			'capability:local-first',
			'Local-first project storage',
			'The site says the manuscript and project files live on the author’s machine.',
			'beta',
			`${page} “Folian is local-first desktop software.” ${release} Beta 4 says application updates preserve local projects and do not replace the writing-data folder.`,
		),
		capability(
			'capability:export',
			'Export',
			'The site mentions export tools and exportable drafts. It does not list export formats.',
			'beta',
			`${page} “export tools that stay under your control.” ${release} Beta 4 corrects project archive filenames when the export format changes. The format list is not in the note.`,
			'Formats are not stated on this page.',
		),
		capability(
			'capability:windows',
			'Windows app',
			'The site lists Windows as in development, not as a current download.',
			'in_development',
			`${page} “Windows: In development.”`,
		),
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
