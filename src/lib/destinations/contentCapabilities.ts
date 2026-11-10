import { inlineText, walkBlocks, type CanonicalArticle } from '@/lib/articles/canonical';
import type { ContentCapabilities } from './types';

/** The Folian Payload content API: Markdown becomes Lexical rich text, and GFM tables become table blocks. */
export const PAYLOAD_CONTENT_CAPABILITIES: ContentCapabilities = {
	headingLevels: [2, 3],
	orderedLists: true,
	unorderedLists: true,
	nestedLists: true,
	tables: true,
	blockquotes: true,
	richBlockquotes: false,
	codeBlocks: true,
	inlineCode: true,
	horizontalRules: true,
	inlineImages: false,
	links: true,
	emphasis: true,
	strikethrough: true,
	rawHtml: false,
	sourcesField: true,
	heroImage: true,
	seoFields: true,
	categories: 'single',
	tags: true,
	draftPreview: true,
};

export type CompatibilityIssue = {
	severity: 'blocking' | 'warning';
	code: string;
	message: string;
	count: number;
};

type Counter = Map<string, CompatibilityIssue>;

function add(issues: Counter, severity: CompatibilityIssue['severity'], code: string, message: string) {
	const existing = issues.get(code);
	if (existing) existing.count += 1;
	else issues.set(code, { severity, code, message, count: 1 });
}

/**
 * Compares the canonical article with what the destination can store. Elements the destination would drop are
 * blocking, so content is never silently lost; elements it would change are warnings.
 */
export function validateForDestination(article: CanonicalArticle, caps: ContentCapabilities): CompatibilityIssue[] {
	const issues: Counter = new Map();
	walkBlocks(
		article.blocks,
		(block, depth) => {
			if (block.type === 'heading') {
				if (block.level === 1) add(issues, 'blocking', 'h1_in_body', 'The body contains an H1. The CMS renders the title as the H1.');
				else if (!caps.headingLevels.includes(block.level)) {
					const nearest = caps.headingLevels.filter((level) => level <= block.level).pop() ?? caps.headingLevels[0];
					add(issues, 'warning', `heading_h${block.level}`, `H${block.level} headings are shown as H${nearest}.`);
				}
				if (!inlineText(block.children).trim()) add(issues, 'blocking', 'empty_heading', 'A heading has no text.');
			}
			if (block.type === 'table') {
				if (!caps.tables) add(issues, 'blocking', 'table_unsupported', 'The destination cannot store tables. Rewrite the table as a list.');
				else if (block.rows.some((row) => row.length !== block.header.length)) add(issues, 'blocking', 'table_ragged', 'A table row has a different number of cells from its header.');
			}
			if (block.type === 'list') {
				if (block.ordered ? !caps.orderedLists : !caps.unorderedLists) add(issues, 'blocking', 'list_unsupported', 'The destination cannot store this kind of list.');
				if (depth > 0 && !caps.nestedLists) add(issues, 'blocking', 'nested_list_unsupported', 'Nested lists would be flattened.');
			}
			if (block.type === 'quote') {
				if (!caps.blockquotes) add(issues, 'blocking', 'quote_unsupported', 'The destination cannot store block quotes.');
				else if (!caps.richBlockquotes && block.children.some((child) => child.type !== 'paragraph')) {
					add(issues, 'blocking', 'quote_content_lost', 'A block quote contains a list or other block that the destination would drop. Keep quotes to plain paragraphs.');
				}
			}
			if (block.type === 'code' && !caps.codeBlocks) add(issues, 'blocking', 'code_unsupported', 'The destination cannot store code blocks.');
			if (block.type === 'rule' && !caps.horizontalRules) add(issues, 'warning', 'rule_dropped', 'Horizontal rules are not kept.');
			if (block.type === 'html' && !caps.rawHtml) add(issues, 'blocking', 'raw_html', 'Raw HTML would be removed. Rewrite it as Markdown.');
		},
		(node) => {
			if (node.type === 'image' && !caps.inlineImages) add(issues, 'blocking', 'inline_image_dropped', 'An inline image would be dropped. Use the hero image or remove it.');
			if (node.type === 'link') {
				if (!caps.links) add(issues, 'blocking', 'links_unsupported', 'The destination cannot store links.');
				else if (!/^https?:\/\//.test(node.url) && !node.url.startsWith('/')) add(issues, 'blocking', 'link_invalid', `A link has an unusable address: ${node.url || '(empty)'}.`);
				if (!inlineText(node.children).trim()) add(issues, 'blocking', 'link_empty_text', 'A link has no visible text.');
			}
			if (node.type === 'text' && node.marks.includes('strike') && !caps.strikethrough) add(issues, 'warning', 'strike_dropped', 'Strikethrough formatting is not kept.');
		},
	);
	if (!article.category && caps.categories !== 'none') add(issues, 'blocking', 'category_missing', 'Choose a category from the destination taxonomy.');
	if (article.category && article.category.name === null) add(issues, 'blocking', 'category_unknown', `The category “${article.category.id}” is not in the destination taxonomy any more.`);
	if (caps.seoFields && !article.seo.description.trim()) add(issues, 'warning', 'seo_description_missing', 'The meta description is empty.');
	return [...issues.values()];
}
