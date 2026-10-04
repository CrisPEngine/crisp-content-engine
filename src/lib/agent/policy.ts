export const CONSEQUENCE_LEVELS = [0, 1, 2, 3, 4] as const;
export type ConsequenceLevel = (typeof CONSEQUENCE_LEVELS)[number];

export const CAPABILITY_GROUPS = [
	'READ',
	'DRAFT',
	'PROPOSE',
	'APPROVE',
	'SCHEDULE',
	'PUBLISH',
	'ENGAGE',
	'ADVERTISE',
	'ADMIN',
] as const;

export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];

export const AGENT_CAPABILITIES = [
	'system:read',
	'brand:read',
	'strategy:read',
	'strategy:propose',
	'content:read',
	'content:create',
	'content:revise',
	'content:submit_for_approval',
	'content:schedule_after_approval',
	'content:approve',
	'content:publish',
	'external:record',
	'performance:read',
	'learning:read',
	'learning:propose',
	'opportunities:read',
	'opportunities:create',
	'research:create',
	'community:read',
	'community:draft_reply',
	'community:publish_reply',
	'experiments:read',
	'experiments:propose',
	'ads:read',
	'ads:analyse',
	'ads:propose',
	'ads:activate',
	'feedback:write',
	'media:read',
	'media:propose',
	'media:generate',
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export const CAPABILITY_GROUP: Record<AgentCapability, CapabilityGroup> = {
	'system:read': 'READ',
	'brand:read': 'READ',
	'strategy:read': 'READ',
	'strategy:propose': 'PROPOSE',
	'content:read': 'READ',
	'content:create': 'DRAFT',
	'content:revise': 'DRAFT',
	'content:submit_for_approval': 'PROPOSE',
	'content:schedule_after_approval': 'SCHEDULE',
	'content:approve': 'APPROVE',
	'content:publish': 'PUBLISH',
	'external:record': 'DRAFT',
	'performance:read': 'READ',
	'learning:read': 'READ',
	'learning:propose': 'PROPOSE',
	'opportunities:read': 'READ',
	'opportunities:create': 'DRAFT',
	'research:create': 'DRAFT',
	'community:read': 'READ',
	'community:draft_reply': 'ENGAGE',
	'community:publish_reply': 'ENGAGE',
	'experiments:read': 'READ',
	'experiments:propose': 'PROPOSE',
	'ads:read': 'READ',
	'ads:analyse': 'READ',
	'ads:propose': 'ADVERTISE',
	'ads:activate': 'ADVERTISE',
	'feedback:write': 'PROPOSE',
	'media:read': 'READ',
	'media:propose': 'PROPOSE',
	'media:generate': 'DRAFT',
};

/**
 * Initial Folian Marketing operator policy.
 * Read, draft, and propose. A human approves. No publish, no spend, no self-approval.
 */
export const FOLIAN_GROK_CAPABILITIES: AgentCapability[] = [
	'system:read',
	'brand:read',
	'strategy:read',
	'strategy:propose',
	'content:read',
	'content:create',
	'content:revise',
	'content:submit_for_approval',
	'content:schedule_after_approval',
	'external:record',
	'performance:read',
	'learning:read',
	'learning:propose',
	'opportunities:read',
	'opportunities:create',
	'research:create',
	'community:read',
	'community:draft_reply',
	'experiments:read',
	'experiments:propose',
	'ads:read',
	'ads:analyse',
	'ads:propose',
	'feedback:write',
	'media:read',
	'media:propose',
	'media:generate',
];

export const FOLIAN_GROK_DENIED: AgentCapability[] = [
	'content:approve',
	'content:publish',
	'community:publish_reply',
	'ads:activate',
];

export type RateLimitPolicy = {
	requestsPerHour: number;
	generationsPerDay: number;
	researchRequestsPerDay: number;
	publishActionsPerDay: number;
	adProposalsPerDay: number;
	imagesPerDay?: number;
	imageCostUsdPerDay?: number;
	dailyCostUsd?: number;
};

export const DEFAULT_RATE_LIMIT: RateLimitPolicy = {
	requestsPerHour: 120,
	generationsPerDay: 20,
	researchRequestsPerDay: 40,
	publishActionsPerDay: 10,
	adProposalsPerDay: 10,
};

export const FOLIAN_GROK_RATE_LIMIT: RateLimitPolicy = {
	requestsPerHour: 60,
	generationsPerDay: 15,
	researchRequestsPerDay: 30,
	publishActionsPerDay: 5,
	adProposalsPerDay: 10,
	imagesPerDay: 4,
	imageCostUsdPerDay: 2,
	dailyCostUsd: 25,
};
