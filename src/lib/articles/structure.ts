export type StructureIssue = {
	code:
		| 'empty_document'
		| 'duplicate_adjacent_heading'
		| 'duplicate_heading'
		| 'empty_section'
		| 'truncated_ending'
		| 'ends_with_heading'
		| 'unclosed_code_fence'
		| 'missing_sections';
	severity: 'critical' | 'major';
	message: string;
};

export type StructureReport = {
	ok: boolean;
	issues: StructureIssue[];
	headingCount: number;
	sectionCount: number;
	wordCount: number;
	endsCleanly: boolean;
	finalSentence: string;
};

type Heading = { level: number; text: string; line: number };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BOLD_LINE_RE = /^\*\*(.+?)\*\*\s*$/;

export function normaliseHeading(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Removes a leading markdown H1 when the destination CMS already renders the page title. */
export function stripCmsTitleHeading(markdown: string, title?: string): string {
	let body = markdown.replace(/\r\n/g, '\n');
	const lines = body.split('\n');
	while (lines.length && !lines[0].trim()) lines.shift();
	if (!lines.length) return body.trim();
	const match = /^#\s+(.+?)\s*#*\s*$/.exec(lines[0].trim());
	if (!match) return body.trim();
	const heading = match[1].trim();
	if (title && normaliseHeading(heading) !== normaliseHeading(title)) return body.trim();
	lines.shift();
	while (lines.length && !lines[0].trim()) lines.shift();
	return lines.join('\n').trim();
}

export function extractHeadings(markdown: string): Heading[] {
	const headings: Heading[] = [];
	let inFence = false;
	markdown.split('\n').forEach((raw, index) => {
		const line = raw.trim();
		if (line.startsWith('```')) inFence = !inFence;
		if (inFence) return;
		const match = HEADING_RE.exec(line);
		if (match) headings.push({ level: match[1].length, text: match[2].trim(), line: index });
	});
	return headings;
}

/**
 * Removes heading lines that repeat the section heading at the start of a drafted section,
 * and demotes stray H1/H2 lines because H2 is reserved for the assembled section heading.
 */
export function cleanSectionBody(body: string, heading: string): string {
	const target = normaliseHeading(heading);
	const lines = body.replace(/\r\n/g, '\n').split('\n');
	while (lines.length) {
		const first = lines[0].trim();
		if (!first) {
			lines.shift();
			continue;
		}
		const match = HEADING_RE.exec(first) ?? BOLD_LINE_RE.exec(first);
		const text = match ? (match.length === 3 ? match[2] : match[1]) : null;
		if (text && normaliseHeading(text) === target) {
			lines.shift();
			continue;
		}
		break;
	}
	let inFence = false;
	return lines
		.map((raw) => {
			if (raw.trim().startsWith('```')) inFence = !inFence;
			if (inFence) return raw;
			const match = /^(\s*)(#{1,2})\s+(.+)$/.exec(raw);
			return match ? `${match[1]}### ${match[3]}` : raw;
		})
		.join('\n')
		.trim();
}

export function assembleSections(sections: Array<{ heading: string; body: string }>): string {
	return sections
		.map((section) => {
			const body = cleanSectionBody(section.body, section.heading);
			return section.heading.trim() ? `## ${section.heading.trim()}\n\n${body}` : body;
		})
		.join('\n\n')
		.trim();
}

/** Splits a markdown article at H2 headings. Content before the first H2 becomes an untitled intro. */
export function parseSections(markdown: string): Array<{ heading: string; body: string }> {
	const sections: Array<{ heading: string; body: string[] }> = [];
	let current: { heading: string; body: string[] } = { heading: '', body: [] };
	let inFence = false;
	for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
		if (raw.trim().startsWith('```')) inFence = !inFence;
		const match = !inFence ? /^##\s+(.+?)\s*#*\s*$/.exec(raw.trim()) : null;
		if (match && !raw.trim().startsWith('###')) {
			if (current.heading || current.body.join('').trim()) sections.push(current);
			current = { heading: match[1].trim(), body: [] };
			continue;
		}
		current.body.push(raw);
	}
	if (current.heading || current.body.join('').trim()) sections.push(current);
	return sections.map((section) => ({ heading: section.heading, body: section.body.join('\n').trim() }));
}

export function plainText(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_`>]/g, '')
		.replace(/^\s*[-+]\s+/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function articleWordCount(markdown: string): number {
	const text = plainText(markdown);
	return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function excerptFrom(markdown: string, maxChars = 280): string {
	const paragraphs = markdown
		.split(/\n\s*\n/)
		.map((part) => part.trim())
		.filter((part) => part && !HEADING_RE.test(part) && !part.startsWith('```') && !/^[-*+]\s/.test(part));
	const first = plainText(paragraphs[0] ?? '');
	if (first.length <= maxChars) return first;
	const sentences = first.split(/(?<=[.!?])\s+/);
	let excerpt = '';
	for (const sentence of sentences) {
		if ((excerpt + ' ' + sentence).trim().length > maxChars) break;
		excerpt = `${excerpt} ${sentence}`.trim();
	}
	return excerpt || `${first.slice(0, maxChars - 1).trim()}…`;
}

const CLEAN_END = /([.!?…]|[.!?…]["'”’)\]*_]+)$/;

function lastBlock(markdown: string): string {
	const blocks = markdown
		.trim()
		.split(/\n\s*\n/)
		.map((block) => block.trim())
		.filter(Boolean);
	return blocks[blocks.length - 1] ?? '';
}

export function endsCleanly(markdown: string): boolean {
	const block = lastBlock(markdown);
	if (!block) return false;
	if (block.startsWith('```') && block.endsWith('```')) return true;
	const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
	const last = lines[lines.length - 1] ?? '';
	if (HEADING_RE.test(last)) return false;
	if (/^\|.*\|$/.test(last)) return true;
	const text = last.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
	return CLEAN_END.test(text);
}

export function validateArticleStructure(markdown: string, options?: { expectedSections?: number }): StructureReport {
	const issues: StructureIssue[] = [];
	const body = markdown.trim();
	const wordCount = articleWordCount(body);
	if (!body) {
		return {
			ok: false,
			issues: [{ code: 'empty_document', severity: 'critical', message: 'The article has no content.' }],
			headingCount: 0,
			sectionCount: 0,
			wordCount: 0,
			endsCleanly: false,
			finalSentence: '',
		};
	}
	const headings = extractHeadings(body);
	const lines = body.split('\n');
	for (let index = 1; index < headings.length; index += 1) {
		const previous = headings[index - 1];
		const current = headings[index];
		const between = lines.slice(previous.line + 1, current.line).join('\n').trim();
		if (normaliseHeading(previous.text) === normaliseHeading(current.text) && !between) {
			issues.push({
				code: 'duplicate_adjacent_heading',
				severity: 'critical',
				message: `The heading “${current.text}” appears twice in a row.`,
			});
		} else if (!between && current.level <= previous.level) {
			issues.push({
				code: 'empty_section',
				severity: 'major',
				message: `The section “${previous.text}” has no content.`,
			});
		}
	}
	const seen = new Map<string, number>();
	for (const heading of headings.filter((item) => item.level === 2)) {
		const key = normaliseHeading(heading.text);
		seen.set(key, (seen.get(key) ?? 0) + 1);
	}
	for (const heading of headings.filter((item) => item.level === 2)) {
		const key = normaliseHeading(heading.text);
		if ((seen.get(key) ?? 0) > 1) {
			if (!issues.some((issue) => issue.code === 'duplicate_heading' && issue.message.includes(heading.text))) {
				issues.push({
					code: 'duplicate_heading',
					severity: 'critical',
					message: `The section heading “${heading.text}” is used more than once.`,
				});
			}
		}
	}
	const fences = lines.filter((line) => line.trim().startsWith('```')).length;
	if (fences % 2 === 1) {
		issues.push({ code: 'unclosed_code_fence', severity: 'critical', message: 'A code block is opened and never closed.' });
	}
	const last = lastBlock(body);
	const lastLine = last.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? '';
	const clean = endsCleanly(body);
	if (HEADING_RE.test(lastLine)) {
		issues.push({ code: 'ends_with_heading', severity: 'critical', message: `The article ends with the heading “${lastLine.replace(/^#+\s*/, '')}” and no content.` });
	} else if (!clean) {
		issues.push({
			code: 'truncated_ending',
			severity: 'critical',
			message: `The article ends mid-sentence: “…${plainText(lastLine).slice(-80)}”.`,
		});
	}
	const sectionCount = headings.filter((item) => item.level === 2).length;
	if (options?.expectedSections && sectionCount < options.expectedSections) {
		issues.push({
			code: 'missing_sections',
			severity: 'critical',
			message: `The outline has ${options.expectedSections} sections and the assembled article has ${sectionCount}.`,
		});
	}
	const finalSentence = plainText(lastLine).split(/(?<=[.!?])\s+/).pop() ?? '';
	return {
		ok: !issues.some((issue) => issue.severity === 'critical'),
		issues,
		headingCount: headings.length,
		sectionCount,
		wordCount,
		endsCleanly: clean,
		finalSentence: finalSentence.slice(-160),
	};
}

export type DiffPart = { type: 'same' | 'added' | 'removed'; text: string };

/** Paragraph-level diff for before-and-after comparison. */
export function diffParagraphs(before: string, after: string): DiffPart[] {
	const a = before.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
	const b = after.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
	const rows = a.length;
	const cols = b.length;
	const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
	for (let i = rows - 1; i >= 0; i -= 1) {
		for (let j = cols - 1; j >= 0; j -= 1) {
			table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}
	const parts: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while (i < rows && j < cols) {
		if (a[i] === b[j]) {
			parts.push({ type: 'same', text: a[i] });
			i += 1;
			j += 1;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			parts.push({ type: 'removed', text: a[i] });
			i += 1;
		} else {
			parts.push({ type: 'added', text: b[j] });
			j += 1;
		}
	}
	while (i < rows) parts.push({ type: 'removed', text: a[i++] });
	while (j < cols) parts.push({ type: 'added', text: b[j++] });
	return parts;
}
