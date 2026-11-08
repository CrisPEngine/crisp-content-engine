import { articleWordCount, extractHeadings, normaliseHeading, validateArticleStructure, type StructureIssue } from './structure';

export type StructuralRepairChange = {
	code: StructureIssue['code'];
	message: string;
	removedLine: string;
	line: number;
};

export type StructuralRepairUnresolved = {
	code: StructureIssue['code'];
	message: string;
	aiRepairSuggested: boolean;
	reason: string;
};

export type StructuralRepairPreview = {
	before: string;
	after: string;
	changes: StructuralRepairChange[];
	unresolved: StructuralRepairUnresolved[];
	canApply: boolean;
	wordCountBefore: number;
	wordCountAfter: number;
	structureBeforeOk: boolean;
	structureAfterOk: boolean;
};

const AI_REPAIR_CODES = new Set<StructureIssue['code']>([
	'duplicate_heading',
	'empty_section',
	'truncated_ending',
	'ends_with_heading',
	'unclosed_code_fence',
	'missing_sections',
]);

function proseWordCount(markdown: string): number {
	return articleWordCount(markdown.replace(/^#{1,6}\s+.*$/gm, ''));
}

/** Removes consecutive duplicate heading lines with no prose between them. Prose is untouched. */
export function removeDuplicateAdjacentHeadings(markdown: string): { body: string; changes: StructuralRepairChange[] } {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const toRemove = new Set<number>();
	const changes: StructuralRepairChange[] = [];
	const headings = extractHeadings(markdown);
	for (let index = 1; index < headings.length; index += 1) {
		const previous = headings[index - 1];
		const current = headings[index];
		const between = lines.slice(previous.line + 1, current.line).join('\n').trim();
		if (normaliseHeading(previous.text) === normaliseHeading(current.text) && !between) {
			toRemove.add(current.line);
			changes.push({
				code: 'duplicate_adjacent_heading',
				message: `Removed the repeated heading “${current.text}”.`,
				removedLine: lines[current.line],
				line: current.line + 1,
			});
		}
	}
	if (!changes.length) return { body: markdown.trim(), changes };
	const body = lines.filter((_, lineIndex) => !toRemove.has(lineIndex)).join('\n').trim();
	return { body, changes };
}

function unresolvedFromIssues(issues: StructureIssue[]): StructuralRepairUnresolved[] {
	return issues.map((issue) => ({
			code: issue.code,
			message: issue.message,
			aiRepairSuggested: AI_REPAIR_CODES.has(issue.code) || issue.code === 'duplicate_adjacent_heading',
			reason:
				issue.code === 'duplicate_heading'
					? 'The same section title appears more than once with content between. Merging sections needs editorial judgement.'
					: issue.code === 'truncated_ending' || issue.code === 'ends_with_heading'
						? 'The ending needs new or restored sentences; removing lines would not fix it.'
						: issue.code === 'unclosed_code_fence'
							? 'Close the code fence or remove the block.'
							: issue.code === 'empty_section'
								? 'Add content under the heading or remove the section.'
								: issue.code === 'missing_sections'
									? 'Regenerate or add the missing sections.'
									: 'This defect has no deterministic fix.',
		}));
}

export function previewStructuralRepair(markdown: string): StructuralRepairPreview {
	const before = markdown.trim();
	const beforeReport = validateArticleStructure(before);
	const { body: after, changes } = removeDuplicateAdjacentHeadings(before);
	const afterReport = validateArticleStructure(after);
	const unresolved = unresolvedFromIssues(changes.length ? afterReport.issues : beforeReport.issues);
	const wordCountBefore = articleWordCount(before);
	const wordCountAfter = articleWordCount(after);
	const prosePreserved = proseWordCount(after) >= proseWordCount(before);
	const criticalBefore = beforeReport.issues.filter((issue) => issue.severity === 'critical').length;
	const criticalAfter = afterReport.issues.filter((issue) => issue.severity === 'critical').length;
	const canApply = changes.length > 0 && prosePreserved && criticalAfter < criticalBefore;
	return {
		before,
		after,
		changes,
		unresolved,
		canApply,
		wordCountBefore,
		wordCountAfter,
		structureBeforeOk: beforeReport.ok,
		structureAfterOk: afterReport.ok,
	};
}
