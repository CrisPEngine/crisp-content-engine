export type AgentAvailability = 'available' | 'partial' | 'planned';

export type AgentCapability = {
	id: string;
	name: string;
	role: string;
	description: string;
	status: AgentAvailability;
	href: string | null;
	action: string;
	tools: string[];
};

/**
 * Typed catalogue of capabilities that already exist in CRISP.
 * Planned entries are labelled as such and do not link to a fake tool.
 */
export const AGENT_CAPABILITIES: AgentCapability[] = [
	{
		id: 'research',
		name: 'Content Research',
		role: 'Research workflow',
		description: 'Finds sources and prepares structured research for a brief. A person approves that research before a draft is written.',
		status: 'available',
		href: '/research',
		action: 'Open research',
		tools: ['Topic research', 'Source list', 'Claim notes'],
	},
	{
		id: 'editorial',
		name: 'Editorial Quality',
		role: 'Editorial workflow',
		description: 'Reviews a draft against quality and brand rules. It stops when a correction needs a person.',
		status: 'available',
		href: '/content',
		action: 'Open content',
		tools: ['Editorial findings', 'Revision history', 'Human approval'],
	},
	{
		id: 'seo',
		name: 'Organic growth checks',
		role: 'Search preparation',
		description: 'Prepares search titles and records whether indexing was confirmed. A sitemap listing is not treated as indexed.',
		status: 'partial',
		href: '/campaigns#operations',
		action: 'View workflow status',
		tools: ['Search title', 'Discovery monitoring'],
	},
	{
		id: 'reputation',
		name: 'Reputation intelligence',
		role: 'Planned',
		description: 'Customer-feedback monitoring is not a production capability in this workspace yet.',
		status: 'planned',
		href: null,
		action: 'On the roadmap',
		tools: [],
	},
];
