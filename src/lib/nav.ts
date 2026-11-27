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
	{ label: 'Workflows', href: '/workflows' },
	{ label: 'Agents', href: '/agents' },
	{
		label: 'Intelligence',
		items: [
			{ label: 'Brand Brain', href: '/intelligence' },
			{ label: 'Strategy', href: '/strategy' },
			{ label: 'Themes', href: '/intelligence?tab=themes' },
			{ label: 'Research', href: '/research' },
			{ label: 'Learnings', href: '/intelligence?tab=learnings' },
			{ label: 'Diagnostics', href: '/intelligence?tab=diagnostics' },
			{ label: 'Monthly briefs', href: '/strategy/monthly-updates' },
		],
	},
	{
		label: 'Content',
		items: [
			{ label: 'Overview', href: '/content' },
			{ label: 'Articles', href: '/content/articles' },
			{ label: 'Create', href: '/content/generate' },
			{ label: 'Calendar', href: '/content/schedule' },
			{ label: 'Approvals', href: '/content/approval' },
			{ label: 'Publishing', href: '/content/published' },
			{ label: 'Assets', href: '/content/brand-assets' },
			{ label: 'Idea Engine', href: '/content/idea-engine' },
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
	{ label: 'Settings', href: '/billing' },
	{ label: 'Help', href: '/docs' },
];

export function navPath(href: string): string {
	return href.split('?')[0]?.split('#')[0] ?? href;
}

function queryMatches(href: string, search: string): boolean {
	const query = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
	if (!query) return false;
	const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	const wanted = new URLSearchParams(query);
	for (const [key, value] of wanted) {
		if (current.get(key) !== value) return false;
	}
	return true;
}

/** One current page. Query-specific siblings do not all light up, and a shorter parent does not stay selected. */
export function isNavHrefActive(pathname: string, href: string, siblings: string[], search = ''): boolean {
	const path = navPath(href);
	const matches = pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
	if (!matches) return false;
	if (href.includes('?')) return pathname === path && queryMatches(href, search);
	const betterSibling = siblings.some((other) => {
		if (other === href) return false;
		const otherPath = navPath(other);
		if (other.includes('?') && otherPath === pathname && queryMatches(other, search)) return true;
		const otherMatches = pathname === otherPath || pathname.startsWith(`${otherPath}/`);
		return otherMatches && otherPath.length > path.length;
	});
	return !betterSibling;
}
