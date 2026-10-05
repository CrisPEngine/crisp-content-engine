import type { ResearchRecord } from '@/lib/agent/types';

const STOP = new Set(['about', 'their', 'there', 'which', 'would', 'should', 'before', 'after', 'using', 'write', 'draft', 'post', 'brand', 'content']);

function words(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 4 && !STOP.has(word));
}

export function selectRelevantResearch(records: ResearchRecord[], instruction: string, attachedIds: string[] = []): ResearchRecord[] {
	const attached = records.filter((record) => attachedIds.includes(record.id));
	const needles = new Set(words(instruction));
	const related = records.filter((record) => {
		if (attached.some((item) => item.id === record.id)) return false;
		const haystack = words(`${record.request} ${record.claims.map((claim) => claim.text).join(' ')}`);
		const overlap = haystack.filter((word) => needles.has(word));
		return overlap.length >= 2;
	});
	return [...attached, ...related].slice(0, 3);
}
