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
	{ label: 'AI Connections', href: '/settings/ai-connections' },
	{
		label: 'Strategy',
		items: [
			{ label: 'View Strategy', href: '/strategy' },
			{ label: 'Monthly Updates', href: '/strategy/monthly-updates' },
			{ label: 'Brand Intelligence', href: '/intelligence' },
			{ label: 'Research', href: '/research' },
		],
	},
	{
		label: 'Content',
		items: [
			{ label: 'Idea Engine', href: '/content/idea-engine' },
			{ label: 'Approval Queue', href: '/content/approval' },
			{ label: 'Scheduled', href: '/content/schedule' },
			{ label: 'Published', href: '/content/published' },
			{ label: 'Generate', href: '/content/generate' },
			{ label: 'Brand assets', href: '/content/brand-assets' },
		],
	},
];
