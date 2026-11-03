export type DestinationCategory = {
	id: string;
	name: string;
	description: string;
	journey?: string[];
};

export type DestinationTool = {
	slug: string;
	label: string;
	routePath?: string;
	linkWhenTopicMatches?: string;
};

export type DestinationTaxonomy = {
	destination: string;
	schemaVersion: number;
	categoryCreationPolicy: 'closed' | 'open';
	categories: DestinationCategory[];
	contentTypes: string[];
	tags: { policy: 'open' | 'closed'; suggested?: string[] };
	tools: DestinationTool[];
	requiredMetadata?: string[];
};

export function assertDestinationCategory(taxonomy: DestinationTaxonomy, categoryId: string): string {
	if (taxonomy.categoryCreationPolicy === 'closed' && !taxonomy.categories.some((item) => item.id === categoryId)) {
		throw new Error(`Unknown category for ${taxonomy.destination}: ${categoryId}`);
	}
	return categoryId;
}

export function categoryIds(taxonomy: DestinationTaxonomy): string[] {
	return taxonomy.categories.map((item) => item.id);
}
