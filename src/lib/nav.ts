export interface NavSubItem {
	label: string;
	href: string;
}

export interface NavItem {
	label: string;
	href?: string;
	items?: NavSubItem[];
}

/** Outcome-oriented navigation. Every href is an existing route. */
export const APP_NAV: NavItem[] = [
	{ label: 'Home', href: '/dashboard' },
	{ label: 'Inbox', href: '/inbox' },
	{
		label: 'Intelligence',
		items: [
			{ label: 'Brand Brain', href: '/intelligence' },
			{ label: 'Strategy', href: '/strategy' },
			{ label: 'Themes', href: '/intelligence?tab=themes' },
			{ label: 'Research', href: '/research' },
			{ label: 'Diagnostics', href: '/intelligence?tab=diagnostics' },
			{ label: 'Monthly briefs', href: '/strategy/monthly-updates' },
		],
	},
	{ label: 'Agents', href: '/agents' },
	{ label: 'Workflows', href: '/workflows' },
	{
		label: 'Content',
		items: [
			{ label: 'Overview', href: '/content' },
			{ label: 'Articles', href: '/content/articles' },
			{ label: 'Publishing', href: '/content/published' },
			{ label: 'Create', href: '/content/generate' },
			{ label: 'Scheduled', href: '/content/schedule' },
			{ label: 'Idea Engine', href: '/content/idea-engine' },
			{ label: 'Brand Assets', href: '/content/brand-assets' },
			{ label: 'Approval', href: '/content/approval' },
		],
	},
	{ label: 'Campaigns', href: '/campaigns' },
	{
		label: 'Integrations',
		items: [
			{ label: 'Channels', href: '/connections' },
			{ label: 'Websites & CMS', href: '/connections/websites' },
			{ label: 'AI Assistants', href: '/settings/ai-connections' },
		],
	},
];

export const APP_NAV_SECONDARY: NavSubItem[] = [
	{ label: 'Brand Brain', href: '/intelligence' },
	{ label: 'Settings', href: '/billing' },
	{ label: 'Help', href: '/docs' },
];
