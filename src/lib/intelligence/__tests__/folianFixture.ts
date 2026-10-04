export const FOLIAN_BRAND_ID = 'recFolianTestBrand';
export const FOLIAN_USER_ID = '00000000-0000-4000-8000-000000000001';

export const folianIdentity = {
	name: 'Folian',
	description: 'A novel-writing studio that helps serious authors keep story memory, character canon, and long-form work under control.',
	purpose: 'Give novelists a durable story operating system rather than another generic writing chatbot.',
	mission: 'Protect narrative continuity so authors can finish ambitious books.',
	positioning: 'The memory layer for serious fiction — canon, characters, and continuity, not autocomplete.',
	productsServices: ['Story memory', 'Character canon', 'Continuity review', 'Manuscript workspace'],
	differentiators: [
		'Remembers canon across sessions',
		'Proposals require author approval before they become fact',
		'Built for novel length, not social snippets',
	],
	audiences: ['Serious fiction authors', 'Independent novelists finishing a first or second book'],
	competitors: ['Generic chatbots', 'Plot-template apps'],
	marketCategory: 'Author tools / creative software',
};

export const folianVoice = {
	tone: 'Calm, precise, literary without being precious',
	personality: 'A rigorous editor who respects the author’s authority',
	formality: 'Slightly formal; never slangy growth-hacker',
	sentenceStyle: 'Clean declarative sentences; occasional longer cadence',
	vocabularyPreferences: 'canon, continuity, manuscript, scene, character, memory',
	humour: 'Dry and rare; never punchlines in product copy',
	pointOfView: 'We when speaking as the product; you for the author',
	pacing: 'Unhurried; no stacked one-line LinkedIn theatre',
	formattingPreferences: 'Short paragraphs; no emoji; no hashtag walls',
};

export const folianGuardrails = {
	phrasesToAvoid: ['unlock your potential', 'delve', 'in today’s fast-paced world', 'game-changer'],
	prohibitedClaims: ['guaranteed bestseller', 'write a novel in a weekend', 'replaces the author'],
	requiredTerminology: [],
	termRules: [
		{
			term: 'canon',
			level: 'STRONGLY_PREFERRED' as const,
			reason: 'Strategic product vocabulary for pieces about story memory. Not required in every post, and not a legal claim.',
		},
		{
			term: 'continuity',
			level: 'STRONGLY_PREFERRED' as const,
			reason: 'Strategic product vocabulary for pieces about story memory. Not required in every post, and not a legal claim.',
		},
	],
	styleRestrictions: ['Do not sound like a social media growth agency'],
	regulatoryConsiderations: [],
	unwantedAiBehaviours: ['fake intimacy', 'hype lists of three', 'motivational-poster closings'],
	ctaRestrictions: ['No hard sell; invite a specific look at story memory'],
	promotionalIntensity: 'low',
};

export const folianKnowledge = {
	brandFacts: ['Folian is built around story memory rather than one-shot generation.'],
	productFacts: ['Authors review proposed facts before they enter canon.'],
	founderFacts: ['Built by people who care about finishing books, not posting more.'],
	faqs: [{ question: 'Does Folian write the novel for me?', answer: 'No. It holds continuity so you can write.' }],
	differentiators: ['Human approval of canon'],
	proofPoints: ['Continuity errors are cheaper to catch in a memory layer than in draft 12.'],
	referenceInformation: ['Primary job: protect the book the author is actually writing.'],
};
