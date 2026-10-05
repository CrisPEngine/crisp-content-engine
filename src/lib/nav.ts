export interface NavSubItem {
	label: string;
	href: string;
}

export interface NavItem {
	label: string;
	href?: string;
	items?: NavSubItem[];
}

export const APP_NAV: NavItem[] = [
	{ label: 'Dashboard', href: '/dashboard' },
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
	{
		label: 'Content',
		items: [
			{ label: 'Create', href: '/content/generate' },
			{ label: 'Approval', href: '/content/approval' },
			{ label: 'Scheduled', href: '/content/schedule' },
			{ label: 'Published', href: '/content/published' },
			{ label: 'Idea Engine', href: '/content/idea-engine' },
			{ label: 'Assets', href: '/content/brand-assets' },
		],
	},
	{
		label: 'Connections',
		items: [
			{ label: 'Channels', href: '/connections' },
			{ label: 'AI Assistants', href: '/settings/ai-connections' },
		],
	},
];
