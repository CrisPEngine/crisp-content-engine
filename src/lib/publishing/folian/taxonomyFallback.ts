import type { DestinationTaxonomy } from '../destinationTaxonomy';

/** Folian-only fallback when the Content API taxonomy endpoint is unreachable. */
export const folianTaxonomyFallback: DestinationTaxonomy = {
	destination: 'folian',
	schemaVersion: 1,
	categoryCreationPolicy: 'closed',
	categories: [
		{ id: 'writing-a-book', name: 'Writing a Book', description: 'From the first idea to a finished draft.' },
		{ id: 'craft', name: 'Craft & Storytelling', description: 'Character, plot, scene, voice, and story choices.' },
		{ id: 'planning-continuity', name: 'Planning & Continuity', description: 'Story bibles, canon, timelines, and series records.' },
		{ id: 'editing', name: 'Editing & Revision', description: 'Revising a manuscript without losing what matters.' },
		{ id: 'publishing', name: 'Publishing', description: 'Traditional and independent publishing paths.' },
		{ id: 'book-marketing', name: 'Book Marketing', description: 'Finding readers and selling books.' },
		{ id: 'tools-ai', name: 'Writing Tools & AI', description: 'Software, AI workflows, and authorship control.' },
	],
	contentTypes: ['guide', 'pillar', 'comparison', 'checklist', 'founder-essay', 'product-explainer'],
	tags: { policy: 'open', suggested: ['needs-review', 'pillar', 'supporting'] },
	tools: [
		{
			slug: 'word-count-planner',
			label: 'Word Count Planner',
			routePath: '/tools/word-count-planner',
			linkWhenTopicMatches: 'novel|first draft|word count|schedule|pace|length',
		},
	],
	requiredMetadata: ['title', 'slug', 'dek', 'category', 'body'],
};
