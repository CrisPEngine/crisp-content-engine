import {
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from '../__tests__/folianFixture';

export const FOLIAN_INCOMPLETE = [
	'measured proof points',
	'founder biography',
	'current campaign name and dates',
	'pricing',
	'customer evidence',
] as const;

export const FOLIAN_PROVENANCE = 'cce_repository_folian_contract';

export const folianThemes = [
	{
		title: 'Canon and continuity',
		description: 'How story memory keeps character canon from drifting between sessions.',
		objective: 'Establish continuity as the job of the product.',
		relatedPillars: ['Continuity craft'],
		keyArguments: ['Continuity dies when a chat session ends', 'Canon should survive the draft'],
		questionsToAnswer: ['What should a novelist be able to trust between sessions?'],
	},
	{
		title: 'Author authority',
		description: 'Proposed facts stay proposals until the author approves them.',
		objective: 'Make author approval the boundary of the product.',
		relatedPillars: ['Author authority'],
		keyArguments: ['Folian does not replace the author', 'Approval is what makes a fact canon'],
		questionsToAnswer: ['Who decides what is true in the book?'],
	},
	{
		title: 'AI and authorship',
		description: 'A memory layer for serious fiction, not a ghostwriter.',
		objective: 'Separate Folian from generic writing chatbots.',
		relatedPillars: ['AI and authorship'],
		keyArguments: ['The product holds memory so the author can write', 'Autocomplete is not the offer'],
		questionsToAnswer: ['What should Folian refuse to do for the author?'],
	},
] as const;

export function folianBrainPatch() {
	return {
		identity: folianIdentity,
		voice: folianVoice,
		guardrails: folianGuardrails,
		knowledge: {
			...folianKnowledge,
			proofPoints: [],
			founderFacts: [],
			referenceInformation: [
				`provenance: ${FOLIAN_PROVENANCE}`,
				...FOLIAN_INCOMPLETE.map((item) => `incomplete: ${item}`),
				...folianKnowledge.referenceInformation,
			],
		},
	};
}
