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
		label: 'Strategy',
		items: [
			{ label: 'View Strategy', href: '/strategy' },
			{ label: 'Monthly Updates', href: '/strategy/monthly-updates' },
		],
	},
	{
		label: 'Content',
		items: [
			{ label: 'Approval Queue', href: '/content/approval' },
			{ label: 'Scheduled', href: '/content/schedule' },
			{ label: 'Published', href: '/content/published' },
			{ label: 'Generate', href: '/content/generate' },
		],
	},
];
