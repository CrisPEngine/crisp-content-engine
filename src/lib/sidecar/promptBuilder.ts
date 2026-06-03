import 'server-only';

import type { z } from 'zod';
import type { LlmMessage } from '@/lib/llm';
import type { SidecarBrandProfile } from './brands';
import { buildBrandVoiceContext } from './brands';
import type { sidecarDraftRequestSchema } from './schemas';

type DraftRequest = z.infer<typeof sidecarDraftRequestSchema>;

const SYSTEM_PROMPT = `You are CRISP Sidecar, a careful reply and outreach drafting assistant for a personal operator.

Rules:
- Output valid JSON only matching the required schema.
- Never invent personal experiences, testimonials, metrics, or proof.
- Never claim you met someone or did something unless explicitly provided in context.
- Respect CTA strength: "None" means no pitch and usually no link; "Very soft" is relationship-first; "Direct" may include a clear CTA but stay authentic.
- Match the brand voice, audience, and content rules provided.
- If replying would be risky, spammy, or off-brand, say so in riskNotes and recommend not replying in recommendedAction.
- Do not be over-promotional. Prefer helpful, human, platform-appropriate tone.
- Include a shortAlternative that is genuinely shorter than draftText.
- fitScore 1-10 reflects how worthwhile engaging is (10 = high-value opportunity).
- suggestedTags are short lowercase labels for CRM tracking.
- suggestedContentIdea is optional; only include when the conversation could become content.

Required JSON schema:
{
  "draftText": "string",
  "shortAlternative": "string",
  "fitScore": number 1-10,
  "opportunitySummary": "string",
  "recommendedAction": "string",
  "ctaRecommendation": "string",
  "linkRecommendation": "string",
  "riskNotes": "string",
  "suggestedFollowUp": "string",
  "suggestedTags": ["string"],
  "suggestedContentIdea": { "title": "", "hook": "", "angle": "", "topicBucket": "" }
}`;

export function buildSidecarDraftMessages(
	profile: SidecarBrandProfile,
	input: DraftRequest,
): LlmMessage[] {
	const brandContext = buildBrandVoiceContext(profile);
	const rewriteMode = Boolean(input.existingDraft?.trim());

	const userParts = [
		'--- Brand profile ---',
		brandContext,
		'',
		'--- Engagement context ---',
		`Platform: ${input.platform}`,
		input.pageUrl ? `Page URL: ${input.pageUrl}` : null,
		input.pageTitle ? `Page title: ${input.pageTitle}` : null,
		input.selectedText ? `Selected text:\n${input.selectedText}` : 'Selected text: (none)',
		input.userNotes ? `Operator notes:\n${input.userNotes}` : null,
		input.targetUrl ? `Target URL (only use if appropriate for CTA strength): ${input.targetUrl}` : null,
		input.contact?.name ? `Contact name: ${input.contact.name}` : null,
		input.contact?.handle ? `Contact handle: ${input.contact.handle}` : null,
		input.contact?.profileUrl ? `Contact profile: ${input.contact.profileUrl}` : null,
		'',
		'--- Request ---',
		`Message type: ${input.messageType}`,
		`Objective: ${input.objective}`,
		`CTA strength: ${input.ctaStrength}`,
		`Relationship stage: ${input.relationshipStage}`,
		rewriteMode ? `Rewrite this draft:\n${input.existingDraft}` : 'Generate a new draft.',
	].filter(Boolean);

	return [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: userParts.join('\n') },
	];
}
