import { z } from 'zod';

export const MESSAGE_TYPES = [
	'Public reply',
	'Comment reply',
	'Direct message',
	'Connection request',
	'Follow-up message',
	'Email-style outreach',
	'Thank-you / relationship message',
	'Support reply',
	'Creator outreach',
	'Dealer outreach',
	'Beta invite',
	'Lead handover note',
] as const;

export const OBJECTIVES = [
	'Brand awareness',
	'Community value',
	'Connection / new follower',
	'Authority building',
	'Soft product mention',
	'Offer promotion',
	'Link sharing / CTA',
	'Lead qualification',
	'Partnership outreach',
	'Creator outreach',
	'Dealer outreach',
	'Customer support',
	'Feedback collection',
	'Research capture',
	'Follow-up / nurture',
] as const;

export const CTA_STRENGTHS = ['None', 'Very soft', 'Soft', 'Medium', 'Direct'] as const;

export const RELATIONSHIP_STAGES = [
	'Unknown',
	'First interaction',
	'Cold',
	'Warm',
	'Engaged',
	'Connected',
	'Existing customer',
	'Partner',
	'Creator',
	'Dealer',
	'Advertiser',
	'Not a fit',
] as const;

export const OPPORTUNITY_STATUSES = [
	'Captured',
	'Drafted',
	'Copied',
	'Posted manually',
	'Sent manually',
	'Needs follow-up',
	'Converted',
	'Ignored',
	'Not a fit',
] as const;

export const OPPORTUNITY_OUTCOMES = [
	'None',
	'Reply received',
	'New follower',
	'Connection accepted',
	'Signup',
	'Lead',
	'Dealer interest',
	'Creator interest',
	'Advertiser interest',
	'Sale',
	'Useful research',
	'Content idea created',
	'No response',
	'Negative response',
] as const;

export const CONTACT_TYPES = [
	'Collector',
	'Seller',
	'Dealer',
	'Custom builder',
	'Content creator',
	'Photographer',
	'Event organiser',
	'Potential advertiser',
	'Writer',
	'Beta user',
	'Writing coach',
	'Editor',
	'Book marketer',
	'Founder',
	'Consultant',
	'Agency owner',
	'Potential client',
	'SaaS founder',
	'Partner',
	'Investor / advisor',
	'Other',
] as const;

export const CONSENT_STATUSES = [
	'Unknown',
	'Public business contact',
	'Provided directly',
	'Existing customer',
	'Newsletter subscriber',
	'Do not contact',
	'Unsubscribed',
	'Suppressed',
] as const;

export const SUPPORTED_PLATFORMS = [
	'web',
	'reddit',
	'x',
	'linkedin',
	'facebook',
	'instagram',
	'youtube',
	'bluesky',
	'threads',
] as const;

const messageTypeSchema = z.enum(MESSAGE_TYPES);
const objectiveSchema = z.enum(OBJECTIVES);
const ctaStrengthSchema = z.enum(CTA_STRENGTHS);
const relationshipStageSchema = z.enum(RELATIONSHIP_STAGES);
const opportunityStatusSchema = z.enum(OPPORTUNITY_STATUSES);
const opportunityOutcomeSchema = z.enum(OPPORTUNITY_OUTCOMES);
const contactTypeSchema = z.enum(CONTACT_TYPES);
const consentStatusSchema = z.enum(CONSENT_STATUSES);

const optionalContactSchema = z
	.object({
		name: z.string().optional(),
		handle: z.string().optional(),
		profileUrl: z.string().optional(),
	})
	.optional();

export const sidecarDraftRequestSchema = z
	.object({
		brandId: z.string().min(1).optional(),
		brand: z.string().min(1).optional(),
		platform: z.string().min(1),
		pageUrl: z.string().optional(),
		pageTitle: z.string().optional(),
		selectedText: z.string().max(8000).optional(),
		userNotes: z.string().max(4000).optional(),
		messageType: messageTypeSchema,
		objective: objectiveSchema,
		ctaStrength: ctaStrengthSchema,
		relationshipStage: relationshipStageSchema,
		targetUrl: z.string().url().optional().or(z.literal('')),
		contact: optionalContactSchema,
		existingDraft: z.string().max(8000).optional(),
	})
	.refine((data) => Boolean(data.brandId || data.brand), {
		message: 'brandId or brand is required',
		path: ['brandId'],
	});

export const suggestedContentIdeaSchema = z
	.object({
		title: z.string(),
		hook: z.string(),
		angle: z.string(),
		topicBucket: z.string(),
	})
	.strict();

export const sidecarDraftOutputSchema = z
	.object({
		draftText: z.string(),
		shortAlternative: z.string(),
		fitScore: z.number().int().min(1).max(10),
		opportunitySummary: z.string(),
		recommendedAction: z.string(),
		ctaRecommendation: z.string(),
		linkRecommendation: z.string(),
		riskNotes: z.string(),
		suggestedFollowUp: z.string(),
		suggestedTags: z.array(z.string()),
		suggestedContentIdea: suggestedContentIdeaSchema.optional(),
	})
	.strict();

export type SidecarDraftOutput = z.infer<typeof sidecarDraftOutputSchema>;

export const sidecarOpportunityRequestSchema = z.object({
	brand: z.string().min(1),
	brandId: z.string().optional(),
	platform: z.string().min(1),
	pageUrl: z.string().optional(),
	pageTitle: z.string().optional(),
	sourceText: z.string().optional(),
	sourceAuthor: z.string().optional(),
	sourceHandle: z.string().optional(),
	sourceProfileUrl: z.string().optional(),
	messageType: messageTypeSchema,
	objective: objectiveSchema,
	ctaStrength: ctaStrengthSchema,
	relationshipStage: relationshipStageSchema,
	draftText: z.string().optional(),
	fitScore: z.number().int().min(1).max(10).optional(),
	opportunitySummary: z.string().optional(),
	shortAlternative: z.string().optional(),
	recommendedAction: z.string().optional(),
	ctaRecommendation: z.string().optional(),
	linkRecommendation: z.string().optional(),
	riskNotes: z.string().optional(),
	suggestedFollowUp: z.string().optional(),
	suggestedTags: z.array(z.string()).optional(),
	status: opportunityStatusSchema.optional(),
	outcome: opportunityOutcomeSchema.optional(),
	notes: z.string().optional(),
	tags: z.array(z.string()).optional(),
});

export const sidecarContactRequestSchema = z.object({
	brand: z.string().min(1),
	brandId: z.string().optional(),
	name: z.string().optional(),
	handle: z.string().optional(),
	platform: z.string().min(1),
	profileUrl: z.string().optional(),
	website: z.string().optional(),
	email: z.string().email().optional().or(z.literal('')),
	phone: z.string().optional(),
	organisation: z.string().optional(),
	country: z.string().optional(),
	contactType: contactTypeSchema,
	relationshipStage: relationshipStageSchema,
	consentStatus: consentStatusSchema,
	sourceUrl: z.string().optional(),
	sourceContext: z.string().optional(),
	notes: z.string().optional(),
	tags: z.array(z.string()).optional(),
	nextAction: z.string().optional(),
	followUpDate: z.string().optional(),
});

export const sidecarContentIdeaRequestSchema = z.object({
	brand: z.string().min(1),
	brandId: z.string().min(1),
	platform: z.string().min(1),
	pageUrl: z.string().optional(),
	selectedText: z.string().optional(),
	suggestedTitle: z.string().min(1),
	suggestedHook: z.string().optional(),
	suggestedAngle: z.string().optional(),
	objective: z.string().optional(),
	targetAudience: z.string().optional(),
	topicBucket: z.string().optional(),
	notes: z.string().optional(),
	sourceUrl: z.string().optional(),
});

export const DEFAULT_BRAND_ALLOWLIST = [
	'Premium Die-Cast',
	'Folian',
	'CrisP Digital',
	'CRISP Content Engine',
	'ABL International',
] as const;
