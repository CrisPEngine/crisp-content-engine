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

function schemaForLevel(level: ConsequenceLevel, schema: z.ZodType): z.ZodType {
	if (level <= 0) return schema;
	const idempotency = { idempotencyKey: z.string().optional() };
	if (schema instanceof z.ZodObject) {
		return schema.extend(idempotency);
	}
	return z.intersection(schema, z.object(idempotency));
}

function action(
	name: string,
	capability: AgentCapability,
	level: ConsequenceLevel,
	description: string,
	schema: z.ZodType = loose,
): AgentActionDefinition {
	return { name, capability, level, description, schema: schemaForLevel(level, schema) };
}

export const AGENT_ACTIONS: AgentActionDefinition[] = [
	action('cce_get_capabilities', 'system:read', 0, 'Capabilities for this agent, by brand and channel. Unavailable means unavailable.'),
	action('cce_list_brands', 'brand:read', 0, 'Brands this credential can access. Names and ids only. No tokens.'),
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
	action(
		'cce_get_brand_channel_destinations',
		'brand:read',
		0,
		'Per-channel connection and publish destination for a brand. No OAuth or tokens.',
		z.object({ brandId }).passthrough(),
	),
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
	action('cce_research_brand', 'research:create', 1, 'Discover a brand from its website and current public sources. Does not overwrite Brand Brain.', z.object({ brandId, website: z.string().optional(), query: z.string().optional() }).passthrough()),
	action('cce_research_topic', 'research:create', 1, 'Research a topic and store a dated evidence packet. Does not write Brand Brain facts.', z.object({ brandId, query: z.string().min(1), website: z.string().optional() }).passthrough()),
	action('cce_research_competitors', 'research:create', 1, 'Find public competitor claims. Classifications stay unclassified until there is evidence.', z.object({ brandId, query: z.string().optional() }).passthrough()),
	action('cce_research_reviews', 'research:create', 1, 'Summarise attributable public review evidence. A small sample is not a market conclusion.', z.object({ brandId, query: z.string().optional() }).passthrough()),
	action('cce_get_research_status', 'content:read', 0, 'Research packets stored for this brand.', z.object({ brandId }).passthrough()),
	action('cce_get_sources', 'content:read', 0, 'Sources for one research packet.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action('cce_get_findings', 'content:read', 0, 'Findings for one research packet.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action('cce_get_claim_evidence', 'content:read', 0, 'A claim and the sources that support it.', z.object({ brandId, researchId: z.string().min(1), claimId: z.string().min(1) }).passthrough()),
	action('cce_get_competitors', 'content:read', 0, 'Competitors stored on a research packet.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action('cce_get_reviews_summary', 'content:read', 0, 'Review summary, including the sample-size caveat.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action('cce_get_trends', 'content:read', 0, 'Trend state for a research packet. One source is not a trend.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action('cce_create_monitor', 'research:create', 1, 'Schedule a bounded research monitor. This does not crawl continuously.', z.object({ brandId, monitorType: z.string().min(1), query: z.string().min(1), cadenceDays: z.number().optional() }).passthrough()),
	action('cce_get_monitors', 'content:read', 0, 'Monitors for this brand.', z.object({ brandId }).passthrough()),
	action('cce_refresh_research', 'research:create', 1, 'Run the stored research query again.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
	action('cce_propose_brand_brain_updates', 'strategy:propose', 1, 'List Brand Brain proposals from research. Does not apply them.', z.object({ brandId, researchId: z.string().min(1) }).passthrough()),
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
	action(
		'cce_get_engagement_inbox',
		'community:read',
		0,
		'Community interactions known to CCE, including Threads reply draft/approval/publish status.',
	),
	action(
		'cce_draft_reply',
		'community:draft_reply',
		1,
		'Draft a Threads reply to another account’s public post. Resolves targetUrl to a media id when possible. Never publishes.',
		z
			.object({
				brandId,
				interactionId: z.string().optional(),
				text: z.string().min(1),
				platform: z.string().optional(),
				targetUrl: z.string().url().optional(),
				externalPostId: z.string().optional(),
				originalPostExcerpt: z.string().optional(),
				originalAuthorHandle: z.string().optional(),
			})
			.passthrough(),
	),
	action(
		'cce_request_reply_approval',
		'community:draft_reply',
		2,
		'Create a human approval request for an exact Threads reply. CCE posts only after the owner approves on the approval page.',
		z.object({ brandId, interactionId: z.string().min(1) }).passthrough(),
	),
	action(
		'cce_diagnose_threads_reply_access',
		'community:read',
		0,
		'Diagnostic: Threads destination, reply OAuth scopes, keyword_search sample, and optional targetUrl resolution. Does not publish.',
		z.object({ brandId, targetUrl: z.string().url().optional() }).passthrough(),
	),
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
	action('cce_create_approval_request', 'content:submit_for_approval', 2, 'Ask the CCE account owner to approve an exact action. Does not approve it.', z.object({ brandId, targetType: z.enum(['content', 'article']).optional(), targetId: z.string().optional(), contentId: z.string().optional(), articleId: z.string().optional(), requestedAction: z.enum(['approve_content', 'approve_and_schedule']).optional(), publishAt: z.string().optional(), idempotencyKey: z.string().optional() }).passthrough()),
	action('cce_get_approval_request', 'content:read', 0, 'Read one human approval request. Does not resolve it.', z.object({ brandId, approvalId: z.string().optional(), id: z.string().optional() }).passthrough()),
	action('cce_list_approval_requests', 'content:read', 0, 'Pending human approval requests for a brand.'),
	action('cce_resolve_approval_request', 'content:submit_for_approval', 3, 'Refuses agent approval. Human authorization uses the authenticated CCE approval page.', z.object({ brandId, approvalId: z.string().optional(), approved: z.boolean().optional() }).passthrough()),
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
		'Attach an existing CCE asset to content, an article, or a brief. Does not publish it.',
		z.object({
			brandId,
			assetId: z.string().min(1),
			contentId: z.string().optional(),
			articleId: z.string().optional(),
			briefId: z.string().optional(),
			targetId: z.string().optional(),
			targetType: z.string().optional(),
		}).passthrough(),
	),
	action('cce_get_assets', 'media:read', 0, 'List brand assets. Storage provider ids are not included.'),
	action('cce_get_asset', 'media:read', 0, 'Read one asset by CCE id.', z.object({ brandId, assetId: z.string().min(1) }).passthrough()),
	action('cce_find_assets', 'media:read', 0, 'Find assets by text. Does not search the storage provider directly.', z.object({ brandId, query: z.string().optional() }).passthrough()),
	action('cce_detach_asset', 'content:create', 1, 'Remove an asset link. Does not delete the stored file.', z.object({ brandId, assetId: z.string().min(1), targetId: z.string().optional(), articleId: z.string().optional(), contentId: z.string().optional() }).passthrough()),
	action('cce_get_media_plan', 'media:read', 0, 'Decide whether media is useful. Does not generate an image.', z.object({ brandId, channel: z.string().optional(), topic: z.string().optional(), objective: z.string().optional(), contentType: z.string().optional() }).passthrough()),
	action('cce_propose_media', 'media:propose', 1, 'Return a media proposal for a channel and topic. Does not generate or publish.', z.object({ brandId, channel: z.string().optional(), topic: z.string().optional(), objective: z.string().optional() }).passthrough()),
	action(
		'cce_generate_image',
		'media:generate',
		1,
		'Generate an image for a content item or article. Calling this tool is an explicit image request and overrides a text-only media plan when the channel supports optional images. Does not publish.',
		z.object({ brandId, contentId: z.string().optional(), articleId: z.string().optional(), briefId: z.string().optional(), channel: z.string().optional(), topic: z.string().optional() }).passthrough(),
	),
	action('cce_create_article_brief', 'content:create', 1, 'Create a long-form article brief from strategy. Does not publish.', z.object({ brandId, topic: z.string().optional(), objective: z.string().optional(), instruction: z.string().optional() }).passthrough()),
	action('cce_generate_article', 'content:create', 1, 'Research, outline, draft by section, review, and store an article. Does not publish.', z.object({ brandId, topic: z.string().optional(), objective: z.string().optional(), instruction: z.string().optional(), targetWords: z.number().optional() }).passthrough()),
	action('cce_get_article', 'content:read', 0, 'Read a stored article.', z.object({ brandId, articleId: z.string().min(1) }).passthrough()),
	action('cce_get_article_status', 'content:read', 0, 'Article status, approval, and publication.', z.object({ brandId, articleId: z.string().min(1) }).passthrough()),
	action('cce_request_article_revision', 'content:revise', 1, 'Revise an article and keep the previous version.', z.object({ brandId, articleId: z.string().min(1), instruction: z.string().min(1), sectionId: z.string().optional() }).passthrough()),
	action('cce_submit_article_for_approval', 'content:submit_for_approval', 2, 'Submit an article for human approval. Does not publish.', z.object({ brandId, articleId: z.string().min(1) }).passthrough()),
	action('cce_get_article_media_plan', 'media:read', 0, 'Hero and inline media proposals for an article.', z.object({ brandId, articleId: z.string().min(1) }).passthrough()),
	action('cce_publish_article', 'content:publish', 3, 'Publish an approved article. Not granted to the Folian operator, and this phase does not call a CMS.'),
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
