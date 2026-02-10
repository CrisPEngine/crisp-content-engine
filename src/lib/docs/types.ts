export type DocFrontmatter = {
	title: string;
	description: string;
	section: string;
	order: number;
};

export type DocHeading = {
	level: 2 | 3;
	text: string;
	id: string;
};

export type DocMeta = DocFrontmatter & {
	slug: string[];
	href: string;
};

export type DocsNavSection = {
	title: string;
	items: DocMeta[];
};

export type DocsSearchItem = {
	href: string;
	title: string;
	description: string;
	section: string;
	keywords?: string;
};
