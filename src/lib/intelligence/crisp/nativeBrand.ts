import type { BrandGuardrails, BrandIdentity, BrandKnowledge, BrandVoice } from '../types';

/** Canonical compatibility record. The other CrisP Digital profile is retained and not used as this brain. */
export const CRISP_CANONICAL_AIRTABLE_ID = 'recQY6or1JBIeKFzR';
export const CRISP_RETAINED_PRODUCT_PROFILE_ID = 'rec4ZrHP3aNQ7hLp0';

export const CRISP_RECONCILIATION_REASON =
	'recQY6or1JBIeKFzR is the consultancy profile: crispdigital.io, the service list, and the public social URLs. rec4ZrHP3aNQ7hLp0 is the CRISP Content Engine product profile. It keeps the published queue and the LinkedIn organization connection. Neither record is deleted.';

const LISTED_SERVICES = [
	'Crisp Content Engine',
	'Crisp Profiles',
	'Web design and development on Framer, Webflow, Squarespace, BigCommerce, Shopify, and other site builders',
	'Performance marketing on Google, Meta, LinkedIn, and Amazon Ads',
	'Email marketing and CRM',
	'AI enablement',
];

export const crispIdentity: BrandIdentity = {
	name: 'CrisP Digital',
	description: 'A digital marketing agency focused on customer experience and client outcomes. The stored specialisms are web design, performance marketing, and AI enablement.',
	purpose: 'Help businesses improve their digital marketing and adopt practical AI, and create qualified consulting conversations.',
	positioning: 'CrisP Digital is the consultancy behind the work: websites, performance marketing, and practical AI enablement. Crisp Content Engine and Crisp Profiles are products it lists. They are not a substitute for verified client results.',
	productsServices: LISTED_SERVICES,
	differentiators: [
		'The BrandProfile lists both agency services and its own products, Crisp Content Engine and Crisp Profiles.',
	],
	audiences: [
		'Founders and business owners without an internal marketing team',
		'Marketing managers and CMOs at small and mid-sized businesses',
		'Creators and consultants building a digital presence',
		'Startups and ecommerce brands looking for performance marketing support',
	],
	marketCategory: 'Marketing agency',
};

export const crispVoice: BrandVoice = {
	tone: 'Friendly, professional, inspirational, and intellectual',
	personality: 'An expert who does the work and still sounds human',
	formality: 'Professional but approachable',
	sentenceStyle: 'Clear marketing and AI language. No em dash. No comma immediately before and.',
	pointOfView: 'First person plural for the consultancy',
};

export const crispGuardrails: BrandGuardrails = {
	phrasesToAvoid: [
		'agency speak',
		'buzzword-heavy jargon',
		'hard sell',
		'meme-heavy casualness',
	],
	prohibitedClaims: [
		'Named clients, revenue, ROAS, conversion lifts, or certifications that are not stored as verified proof',
		'Current ChatGPT advertising availability, formats, targeting, pricing, rollout, or advertiser access',
		'The campaign line that Crisp Content Engine early access is limited to 10 customers',
		'Treating ROI-driven or campaigns that perform as measured proof',
	],
	styleRestrictions: ['Do not use an em dash', 'Do not put a comma immediately before and'],
	unwantedAiBehaviours: [
		'Do not promote external research or a proposed claim into a brand fact',
		'Do not fill a ChatGPT advertising draft with model memory about the product',
	],
	ctaRestrictions: ['Invite a conversation. Do not invent an offer, price, or scarcity.'],
	promotionalIntensity: 'Low. Insight before pitch.',
};

export const crispKnowledge: BrandKnowledge = {
	brandFacts: [
		'FACT: CrisP Digital describes itself as a digital marketing agency specialising in web design, performance marketing, and AI enablement. Website: https://www.crispdigital.io.',
		`FACT: The canonical BrandProfile lists these services: ${LISTED_SERVICES.join('; ')}.`,
		'FACT: Public profile URLs are stored for LinkedIn, Instagram, Facebook, and X. A stored URL is not an OAuth connection.',
		'FACT: No client names, revenue, case-study results, or certifications are stored as verified proof.',
		'FACT: Current ChatGPT advertising availability, formats, targeting, pricing, rollout, and advertiser access are not stored. That is a research gap.',
		'FACT: Performance history for this canonical profile is insufficient. The profile published count is 0 and no analytics snapshot is stored.',
	],
	productFacts: [
		'FACT: Crisp Content Engine is listed as an AI content system for creation, scheduling, and optimisation.',
		'FACT: Crisp Profiles is listed as personal websites for professionals.',
	],
	proofPoints: [],
	referenceInformation: [
		'VERIFIED PROOF: none stored.',
		'POSITIONING: Elevate the consultancy through practical digital marketing, AI enablement, and emerging advertising channels, and use that authority to start qualified conversations.',
		'STRATEGIC CLAIM: The account owner also names SEO and UX as service areas. SEO is not in the stored offers list.',
		'STRATEGIC CLAIM: Airtable strategy copy says the agency merges AI with personalised marketing for performance. That sentence is generated strategy, not measured proof.',
		'PROPOSED CLAIM: Campaign copy says Crisp Content Engine early access is limited to 10 customers, and that an early adopter package exists for Crisp Profiles. Neither is verified.',
		'EXTERNAL RESEARCH: none ingested for ChatGPT advertising.',
		`SOURCE: Airtable BrandProfiles ${CRISP_CANONICAL_AIRTABLE_ID}.`,
		`RETAINED DUPLICATE: ${CRISP_RETAINED_PRODUCT_PROFILE_ID} is the Content Engine product profile. It is not this Brand Brain. Its LinkedIn organization connection was not moved.`,
		'UNRESOLVED: the consultancy profile timezone is America/New_York and the product profile timezone is Asia/Dubai. Neither is treated as a headquarters fact.',
	],
};

export const crispThemes = [
	{
		title: 'Practical AI enablement',
		description: 'How a business can adopt AI in marketing and operations without pretending the tool is the strategy.',
		objective: 'Show that CrisP Digital does the implementation work, using only listed services.',
		relatedPillars: ['AI enablement'],
		keyArguments: ['AI adoption is an operating change, not a content trick', 'Crisp Content Engine is one listed tool, not the whole consultancy'],
		questionsToAnswer: ['What can a business adopt now without an unverified result claim?'],
	},
	{
		title: 'Performance marketing',
		description: 'Google, Meta, LinkedIn, and Amazon advertising as listed services.',
		objective: 'Talk about channel choice and measurement without inventing account results.',
		relatedPillars: ['Performance marketing'],
		keyArguments: ['The profile lists four ad channels', 'A listed channel is not a case study'],
		questionsToAnswer: ['Which listed channel is the subject, and what proof is missing?'],
	},
	{
		title: 'Web and customer experience',
		description: 'Websites built on the platforms named in the BrandProfile, judged by the experience they create.',
		objective: 'Keep web work concrete: Framer, Webflow, BigCommerce, Shopify, Squarespace.',
		relatedPillars: ['Web design'],
		keyArguments: ['The build platform is a fact when it is one of the listed builders', 'A faster website is not a verified conversion claim'],
		questionsToAnswer: ['What part of the site experience is the post actually about?'],
	},
	{
		title: 'Emerging advertising channels',
		description: 'New places advertising may appear, including ChatGPT advertising as one open question.',
		objective: 'Prepare the audience without stating unverified product facts.',
		relatedPillars: ['Performance marketing', 'AI enablement'],
		keyArguments: ['Preparation is a planning topic', 'Availability, formats, price, and access are a research gap until a dated source is stored'],
		questionsToAnswer: ['What is known from a stored source, and what must stay unnamed?'],
	},
	{
		title: 'Lessons from building the products',
		description: 'What building Crisp Content Engine and Crisp Profiles shows about marketing systems. No customer counts or revenue.',
		objective: 'Use the products as experience, not as proof of client outcomes.',
		relatedPillars: ['AI enablement'],
		keyArguments: ['The products are listed offers', 'Building them is not a client case study'],
		questionsToAnswer: ['Which lesson comes from the product itself rather than from a client result?'],
	},
] as const;
