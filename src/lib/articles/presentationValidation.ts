export type PresentationStyle = {
	titleCase: 'sentence' | 'title';
	brandNames: string[];
	acronyms?: string[];
};

export type PresentationIssue = { code: string; message: string; severity: 'major' | 'minor' };

const FOLIAN_STYLE: PresentationStyle = { titleCase: 'sentence', brandNames: ['Folian', 'Story Bible'], acronyms: ['AI', 'SEO', 'CTA', 'API'] };

export function presentationStyleFor(brandName: string | null | undefined): PresentationStyle {
	if (/folian/i.test(brandName ?? '')) return FOLIAN_STYLE;
	return { titleCase: 'sentence', brandNames: brandName ? [brandName] : [], acronyms: ['AI', 'SEO'] };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sentenceCase(value: string, style: PresentationStyle): string {
	const trimmed = value.trim();
	if (!trimmed) return trimmed;
	const terms = [...style.brandNames, ...(style.acronyms ?? [])].filter(Boolean).sort((left, right) => right.length - left.length);
	if (style.titleCase === 'title') {
		return trimmed.replace(/\S+/g, (word) => {
			const kept = terms.find((term) => !term.includes(' ') && term.toLowerCase() === word.toLowerCase());
			if (kept) return kept;
			const lower = word.toLowerCase();
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		});
	}
	let result = trimmed.toLowerCase();
	const first = result.search(/[a-z]/i);
	if (first >= 0) result = result.slice(0, first) + result.charAt(first).toUpperCase() + result.slice(first + 1);
	for (const term of terms) result = result.replace(new RegExp(escapeRegExp(term), 'ig'), term);
	return result;
}

export function validatePresentation(input: {
	title: string;
	seoTitle?: string | null;
	metaDescription?: string | null;
	body: string;
	altText?: string | null;
	brandName?: string | null;
	style?: PresentationStyle;
}): PresentationIssue[] {
	const style = input.style ?? presentationStyleFor(input.brandName);
	const issues: PresentationIssue[] = [];
	const expectedTitle = sentenceCase(input.title, style);
	if (input.title.trim() && input.title.trim() !== expectedTitle) {
		issues.push({ code: 'title-case', severity: 'minor', message: `Use “${expectedTitle}” for the article title.` });
	}
	if (input.seoTitle?.trim()) {
		const expectedSeo = sentenceCase(input.seoTitle, style);
		if (input.seoTitle.trim() !== expectedSeo) issues.push({ code: 'seo-title-case', severity: 'minor', message: `Use “${expectedSeo}” for the SEO title.` });
		if (input.seoTitle.length > 70) issues.push({ code: 'seo-title-length', severity: 'major', message: 'The SEO title is longer than 70 characters.' });
	}
	const description = input.metaDescription?.trim() ?? '';
	if (!description) issues.push({ code: 'seo-description-missing', severity: 'major', message: 'The meta description is empty.' });
	else if (description.length > 160) issues.push({ code: 'seo-description-length', severity: 'major', message: 'The meta description is longer than 160 characters.' });
	const headings = [...input.body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
	for (const heading of headings) {
		if (heading !== sentenceCase(heading, style)) issues.push({ code: 'heading-case', severity: 'minor', message: `Heading “${heading}” should be “${sentenceCase(heading, style)}”.` });
	}
	if (/  +/.test(input.body) || /[ ][,.;]/.test(input.body) || /[!?]{2,}|,,/.test(input.body)) issues.push({ code: 'punctuation-spacing', severity: 'minor', message: 'Remove the extra space or repeated punctuation.' });
	const prose = `${input.title}\n${input.body}`.replace(/https?:\/\/\S+/g, ' ');
	for (const name of style.brandNames) {
		const forms = [...prose.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'))].map((match) => match[0]);
		if (forms.some((form) => form !== name)) issues.push({ code: 'brand-name', severity: 'major', message: `Write the brand as “${name}”.` });
	}
	const links = [...input.body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
	for (const url of links) {
		if (!/^https?:\/\//.test(url) && !url.startsWith('/')) issues.push({ code: 'link-invalid', severity: 'major', message: `The link “${url}” is not a usable address.` });
	}
	if (/^\s*[-*]\s+\[[ xX]\]/m.test(input.body)) issues.push({ code: 'task-list', severity: 'minor', message: 'Replace checkbox lists with ordinary lists before sending the draft.' });
	if (input.altText !== undefined && !input.altText?.trim()) issues.push({ code: 'alt-text', severity: 'major', message: 'The hero image needs alt text.' });
	if (/desktop app that writes the book|one-click publish|automatically publishes/i.test(input.body)) {
		issues.push({ code: 'unsupported-claim', severity: 'major', message: 'A product claim is not in the approved brand evidence.' });
	}
	const ending = input.body.slice(input.body.lastIndexOf('\n##'));
	if (input.body.includes('\n##') && !/\b(next|checklist|before the next|approve)\b/i.test(ending)) {
		issues.push({ code: 'cta-suitability', severity: 'minor', message: 'The close should tell the reader what to do next.' });
	}
	return issues;
}
