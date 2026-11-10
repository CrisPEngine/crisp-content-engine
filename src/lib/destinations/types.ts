import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';

export const DESTINATION_PROVIDERS = ['payload_content_api', 'wordpress', 'webflow', 'ghost', 'custom_api'] as const;

export type DestinationProviderId = (typeof DESTINATION_PROVIDERS)[number];

export type DestinationSettings = {
	fieldMappings: Record<string, string>;
	media: { delivery: 'upload' | 'url'; maxBytes: number; allowedImageHosts: string[] };
	defaultAuthor: string;
	seo: { titleTemplate: string; descriptionMaxLength: number };
	defaultCategoryId: string | null;
	topicMappings: Array<{ topic: string; categoryId: string }>;
	/** Publication is always a person acting in the CMS. This is stored so the UI can show it, and is never true. */
	allowPublish: false;
};

export type DestinationHealth = {
	status: 'unknown' | 'healthy' | 'degraded' | 'error' | 'disabled';
	checkedAt: string | null;
	message: string | null;
	latencyMs: number | null;
};

export type TaxonomyDiff = {
	added: Array<{ id: string; name: string }>;
	removed: Array<{ id: string; name: string }>;
	renamed: Array<{ id: string; from: string; to: string }>;
	unmappedTopics: string[];
	missingDefault: boolean;
	checkedAt: string;
};

export type WebsiteDestination = {
	id: string;
	ownerUserId: string;
	brandId: string;
	key: string;
	provider: DestinationProviderId;
	name: string;
	baseUrl: string | null;
	enabled: boolean;
	credentialSource: 'stored' | 'environment';
	settings: DestinationSettings;
	taxonomy: DestinationTaxonomy | null;
	taxonomySyncedAt: string | null;
	taxonomyDiff?: TaxonomyDiff | null;
	health: DestinationHealth;
	createdAt: string;
	updatedAt: string;
};

/** Destination as sent to the browser: credentials are reduced to whether they exist. */
export type WebsiteDestinationView = Omit<WebsiteDestination, 'ownerUserId'> & {
	hasCredentials: boolean;
	providerLabel: string;
	capabilities: ProviderCapabilities;
	providerAvailable: boolean;
};

export type DestinationCredentials = { apiKey?: string; bypassToken?: string };

export type ProviderCapabilities = {
	testConnection: boolean;
	taxonomy: boolean;
	draftLookup: boolean;
	draftSubmission: boolean;
	mediaUpload: boolean;
	scheduling: boolean;
	/** Always false. CCE does not publish website articles automatically. */
	publishing: false;
};

export type DestinationConnection = {
	destination: WebsiteDestination;
	baseUrl: string;
	credentials: DestinationCredentials;
};

export type DraftLookup = { exists: false } | { exists: true; revision: number; status: string; title: string; category: string | null; slug: string | null };

/** How a CMS upsert should treat an existing record (draft proposal, new update, or published correction). */
export type DestinationDraftMode = 'update' | 'proposal' | 'correction';

export type DraftSubmission = {
	externalId: string;
	baseRevision?: number;
	mode: DestinationDraftMode;
	payload: Record<string, unknown>;
};

export type DraftResult = { ok: true; revision?: number; adminUrl?: string; previewUrl?: string } | { ok: false; error: string };

export type DestinationAdapter = {
	testConnection(connection: DestinationConnection): Promise<{ ok: boolean; message: string; latencyMs: number }>;
	fetchTaxonomy(connection: DestinationConnection): Promise<DestinationTaxonomy>;
	lookupDraft(connection: DestinationConnection, externalId: string): Promise<DraftLookup>;
	submitDraft(connection: DestinationConnection, submission: DraftSubmission): Promise<DraftResult>;
	uploadMedia(
		connection: DestinationConnection,
		input: { bytes: Buffer; filename: string; mimeType: string; alt: string; credit: string; license: string },
	): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }>;
};

/** What the destination's body format can hold. Anything outside it must be fixed before submission, never dropped. */
export type ContentCapabilities = {
	/** Heading levels the CMS keeps. Others are mapped to the nearest supported level. */
	headingLevels: number[];
	orderedLists: boolean;
	unorderedLists: boolean;
	nestedLists: boolean;
	tables: boolean;
	blockquotes: boolean;
	/** Whether a quote can hold lists or several paragraphs, not only one paragraph of text. */
	richBlockquotes: boolean;
	codeBlocks: boolean;
	inlineCode: boolean;
	horizontalRules: boolean;
	inlineImages: boolean;
	links: boolean;
	emphasis: boolean;
	strikethrough: boolean;
	rawHtml: boolean;
	sourcesField: boolean;
	heroImage: boolean;
	seoFields: boolean;
	categories: 'single' | 'multiple' | 'none';
	tags: boolean;
	/** True when the CMS can render a draft preview that reflects its own templates. */
	draftPreview: boolean;
};

export type ProviderDefinition = {
	id: DestinationProviderId;
	label: string;
	available: boolean;
	note: string;
	capabilities: ProviderCapabilities;
	/** Null when the provider is not built yet, so nothing can be validated against it. */
	content: ContentCapabilities | null;
	adapter: DestinationAdapter | null;
};

export function defaultDestinationSettings(): DestinationSettings {
	return {
		fieldMappings: { title: 'title', dek: 'dek', body: 'layout', category: 'category', tags: 'tags', seoTitle: 'seoTitle', seoDescription: 'seoDescription' },
		media: { delivery: 'upload', maxBytes: 8 * 1024 * 1024, allowedImageHosts: ['res.cloudinary.com'] },
		defaultAuthor: '',
		seo: { titleTemplate: '{title}', descriptionMaxLength: 160 },
		defaultCategoryId: null,
		topicMappings: [],
		allowPublish: false,
	};
}
