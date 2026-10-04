import { z } from 'zod';
import type { AgentCapability, ConsequenceLevel } from './policy';

const brandId = z.string().min(1).optional();
const loose = z.object({ brandId }).passthrough();

export type AgentActionDefinition = {
	name: string;
	description: string;
	capability: AgentCapability;
	level: ConsequenceLevel;
	schema: z.ZodType;
};

function action(
	name: string,
	capability: AgentCapability,
	level: ConsequenceLevel,
	description: string,
	schema: z.ZodType = loose,
): AgentActionDefinition {
	return { name, capability, level, description, schema };
}

export const AGENT_ACTIONS: AgentActionDefinition[] = [
	action('cce_get_capabilities', 'system:read', 0, 'Capabilities for this agent, by brand and channel. Unavailable means unavailable.'),
	action('cce_get_system_status', 'system:read', 0, 'Operational status, failed jobs, pending approvals, and model roles. No secrets.'),
	action('cce_get_brands', 'brand:read', 0, 'Brands this agent is allowed to access.'),
	action(
		'cce_get_brand',
		'brand:read',
		0,
		'Structured Brand Brain sections. Defaults to identity, positioning, voice, and guardrails.',
		z.object({ brandId, sections: z.array(z.string()).optional() }).passthrough(),
	),
	action('cce_get_brand_health', 'brand:read', 0, 'Missing or stale Brand Brain, strategy, proof, and connection gaps.'),
	action('cce_get_strategy', 'strategy:read', 0, 'Objectives, audiences, positioning, pillars, channels, CTAs, campaigns, and themes.'),
	action('cce_get_themes', 'strategy:read', 0, 'Active content themes for the brand.'),
	action('cce_get_campaigns', 'strategy:read', 0, 'Content and marketing campaigns stored in CCE, not only paid media.'),
	action(
		'cce_create_theme_proposal',
		'strategy:propose',
		1,
		'Propose a theme. Does not replace strategy.',
		z.object({ brandId, title: z.string().min(1), rationale: z.string().min(1), channel: z.string().optional() }).passthrough(),
	),
	action(
		'cce_update_strategy_proposal',
		'strategy:propose',
		1,
		'Propose a strategy change for human review. Does not apply it.',
		z.object({ brandId, summary: z.string().min(1), proposedChange: z.string().min(1) }).passthrough(),
	),
	action(
		'cce_get_calendar',
		'content:read',
		0,
		'Scheduled, drafted, awaiting approval, published, failed, and planned items.',
		z.object({
			brandId,
			start: z.string().optional(),
			end: z.string().optional(),
			channels: z.array(z.string()).optional(),
			status: z.string().optional(),
			campaignId: z.string().optional(),
			themeId: z.string().optional(),
		}).passthrough(),
	),
	action('cce_get_calendar_gaps', 'content:read', 0, 'Strategic gaps in the calendar and theme usage.'),
	action('cce_get_opportunities', 'opportunities:read', 0, 'Marketing opportunities submitted to CCE.'),
	action(
		'cce_create_opportunity',
		'opportunities:create',
		1,
		'Submit an externally discovered opportunity. CCE stores provenance and does not treat it as a brand fact.',
		z.object({
			brandId,
			source: z.string().min(1),
			topic: z.string().min(1),
			summary: z.string().min(1),
			sourcePlatform: z.string().optional(),
			sourceUrl: z.string().optional(),
			sourceId: z.string().optional(),
			opportunityType: z.string().optional(),
			whyRelevant: z.string().optional(),
			audience: z.string().optional(),
			suggestedAction: z.string().optional(),
			suggestedChannel: z.string().optional(),
			urgency: z.string().optional(),
			confidence: z.string().optional(),
			evidence: z.array(z.record(z.string(), z.unknown())).optional(),
			relatedThemeId: z.string().optional(),
			expiresAt: z.string().optional(),
		}).passthrough(),
	),
	action('cce_evaluate_opportunity', 'opportunities:read', 0, 'Score an opportunity against Brand Brain, strategy, and repetition.', z.object({ brandId, opportunityId: z.string().min(1) }).passthrough()),
	action(
		'cce_create_research_request',
		'research:create',
		1,
		'Store research provenance. Does not write Brand Brain facts.',
		z.object({
			brandId,
			request: z.string().min(1),
			sources: z.array(z.record(z.string(), z.unknown())).optional(),
			claims: z.array(z.record(z.string(), z.unknown())).optional(),
		}).passthrough(),
	),
	action('cce_get_research', 'content:read', 0, 'Read a stored research record.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action(
		'cce_attach_research_to_brief',
		'research:create',
		1,
		'Attach stored research to a brief without promoting claims to Brand Brain.',
		z.object({ brandId, researchId: z.string().min(1), briefId: z.string().min(1) }).passthrough(),
	),
	action('cce_get_drafts', 'content:read', 0, 'Drafts and items not yet approved.'),
	action('cce_get_content', 'content:read', 0, 'One content record by CCE id.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action(
		'cce_create_brief',
		'content:create',
		1,
		'Create a brief. CCE fills objective, audience, and theme from strategy. Does not call a model by name.',
		z.object({
			brandId,
			objective: z.string().optional(),
			channel: z.string().optional(),
			channels: z.array(z.string()).optional(),
			instruction: z.string().optional(),
			opportunityId: z.string().optional(),
			themeId: z.string().optional(),
			assetIds: z.array(z.string()).optional(),
		}).passthrough(),
	),
	action(
		'cce_generate_content',
		'content:create',
		1,
		'Generate channel-native content through the CCE intelligence pipeline.',
		z.object({
			brandId,
			briefId: z.string().optional(),
			channel: z.string().optional(),
			channels: z.array(z.string()).optional(),
			instruction: z.string().optional(),
			objective: z.string().optional(),
			themeId: z.string().optional(),
			opportunityId: z.string().optional(),
		}).passthrough(),
	),
	action(
		'cce_generate_from_opportunity',
		'content:create',
		1,
		'Evaluate an opportunity, then brief and generate only when it fits.',
		z.object({ brandId, opportunityId: z.string().min(1), channel: z.string().optional() }).passthrough(),
	),
	action(
		'cce_request_revision',
		'content:revise',
		1,
		'Revise content. Previous and new versions are kept and reviewed.',
		z.object({ brandId, contentId: z.string().min(1), instruction: z.string().min(1) }).passthrough(),
	),
	action('cce_get_versions', 'content:read', 0, 'Stored versions for one content record.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action('cce_compare_versions', 'content:read', 0, 'Compare the latest stored versions.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action('cce_get_pending_approvals', 'content:read', 0, 'Content waiting for a human approver.'),
	action('cce_submit_for_approval', 'content:submit_for_approval', 2, 'Submit content for human approval. Does not publish.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action('cce_approve_content', 'content:approve', 3, 'Approve content. Not granted to the Folian operator credential.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action('cce_reject_content', 'content:approve', 3, 'Reject content. Requires the approver capability.', z.object({ brandId, contentId: z.string().min(1), reason: z.string().optional() }).passthrough()),
	action('cce_get_schedule_recommendation', 'content:read', 0, 'Scheduling guidance. Does not invent an optimal time when history is thin.'),
	action(
		'cce_schedule_content',
		'content:schedule_after_approval',
		2,
		'Record a schedule for approved content. Does not arm the external publisher.',
		z.object({ brandId, contentId: z.string().min(1), publishAt: z.string().min(1) }).passthrough(),
	),
	action(
		'cce_reschedule_content',
		'content:schedule_after_approval',
		2,
		'Change a CCE schedule time. Does not arm the external publisher.',
		z.object({ brandId, contentId: z.string().min(1), publishAt: z.string().min(1) }).passthrough(),
	),
	action('cce_unschedule_content', 'content:schedule_after_approval', 2, 'Remove a CCE schedule time.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action('cce_get_content_performance', 'performance:read', 0, 'Performance for one content record, including when history is insufficient.', z.object({ brandId, contentId: z.string().min(1) }).passthrough()),
	action('cce_get_channel_performance', 'performance:read', 0, 'Performance for a channel.', z.object({ brandId, channel: z.string().optional() }).passthrough()),
	action('cce_get_top_content', 'performance:read', 0, 'Top and underperforming content when the sample supports it.'),
	action('cce_get_performance_baseline', 'performance:read', 0, 'Baseline for a channel. Insufficient samples are stated.', z.object({ brandId, channel: z.string().optional() }).passthrough()),
	action('cce_compare_content', 'performance:read', 0, 'Compare two content records against available history.', z.object({ brandId, contentIds: z.array(z.string().min(1)).min(2) }).passthrough()),
	action('cce_get_learnings', 'learning:read', 0, 'Content, edit, and performance learnings with their confidence.'),
	action(
		'cce_propose_learning',
		'learning:propose',
		1,
		'Propose a learning as a candidate. Does not rewrite Brand Brain.',
		z.object({ brandId, observation: z.string().min(1), channel: z.string().optional() }).passthrough(),
	),
	action('cce_get_experiments', 'experiments:read', 0, 'Experiments and their confidence.'),
	action(
		'cce_propose_experiment',
		'experiments:propose',
		1,
		'Propose an experiment only when stored evidence supports one. No winner from a tiny sample.',
		z.object({ brandId, hypothesis: z.string().optional() }).passthrough(),
	),
	action('cce_analyse_experiment', 'experiments:read', 0, 'Analyse an experiment without claiming certainty the sample cannot support.', z.object({ brandId, experimentId: z.string().min(1) }).passthrough()),
	action('cce_get_engagement_inbox', 'community:read', 0, 'Community interactions known to CCE.'),
	action(
		'cce_draft_reply',
		'community:draft_reply',
		1,
		'Draft a reply. Does not send it.',
		z.object({ brandId, interactionId: z.string().optional(), text: z.string().min(1), platform: z.string().optional(), externalPostId: z.string().optional() }).passthrough(),
	),
	action('cce_request_reply_approval', 'community:draft_reply', 2, 'Ask a human to approve a reply draft. Does not send it.', z.object({ brandId, interactionId: z.string().min(1) }).passthrough()),
	action(
		'cce_record_external_publish',
		'external:record',
		2,
		'Record a publish that already happened outside CCE. Does not publish.',
		z.object({
			brandId,
			contentId: z.string().min(1),
			channel: z.string().min(1),
			externalId: z.string().min(1),
			externalUrl: z.string().min(1),
			publishedAt: z.string().optional(),
			method: z.string().optional(),
		}).passthrough(),
	),
	action(
		'cce_record_external_engagement',
		'external:record',
		1,
		'Record engagement from an external or manual source, with source and reliability.',
		z.object({
			brandId,
			contentId: z.string().optional(),
			channel: z.string().min(1),
			source: z.string().min(1),
			reliability: z.string().optional(),
			impressions: z.number().optional(),
			clicks: z.number().optional(),
			reactions: z.number().optional(),
			comments: z.number().optional(),
			shares: z.number().optional(),
		}).passthrough(),
	),
	action('cce_get_ad_campaigns', 'ads:read', 0, 'Paid campaigns. Returns unavailable when no ad account is connected.'),
	action('cce_get_ad_performance', 'ads:read', 0, 'Paid performance. Returns unavailable when no ad account is connected.'),
	action('cce_analyse_ad_performance', 'ads:analyse', 0, 'Read-only ad analysis. Does not change spend.'),
	action(
		'cce_propose_ad_campaign',
		'ads:propose',
		2,
		'Propose a paused campaign concept. Does not create or activate a campaign.',
		z.object({ brandId, platform: z.string().min(1), summary: z.string().min(1), reason: z.string().min(1) }).passthrough(),
	),
	action(
		'cce_propose_budget_change',
		'ads:propose',
		4,
		'Propose a budget change for human approval. Does not change spend.',
		z.object({ brandId, platform: z.string().min(1), campaign: z.string().min(1), reason: z.string().min(1), dailyBudgetDelta: z.string().optional(), totalBudgetDelta: z.string().optional() }).passthrough(),
	),
	action('cce_get_marketing_brief', 'system:read', 0, 'Daily marketing brief assembled from CCE state.'),
	action('cce_get_next_best_actions', 'system:read', 0, 'Prioritised actions, with approval requirements.'),
	action(
		'cce_record_agent_feedback',
		'feedback:write',
		1,
		'Record operator feedback. Does not rewrite Brand Brain.',
		z.object({ brandId, note: z.string().min(1), subjectType: z.string().optional(), subjectId: z.string().optional() }).passthrough(),
	),
	action(
		'cce_attach_asset',
		'content:create',
		1,
		'Attach an existing asset reference to a brief. This is not a media library.',
		z.object({
			brandId,
			kind: z.enum(['image', 'video', 'audio', 'document', 'link_preview', 'carousel']),
			briefId: z.string().optional(),
			source: z.string().optional(),
			altText: z.string().optional(),
			mime: z.string().optional(),
		}).passthrough(),
	),
];

const byName = new Map(AGENT_ACTIONS.map((definition) => [definition.name, definition]));

export function getAgentAction(name: string): AgentActionDefinition | null {
	return byName.get(name) ?? null;
}

export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
	const json = z.toJSONSchema(schema) as Record<string, unknown>;
	delete json.$schema;
	return json;
}
