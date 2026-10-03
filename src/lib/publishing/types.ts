export type ArticleDocument = {
	title?: string;
	body: string;
	excerpt?: string;
	canonicalUrl?: string;
	tags?: string[];
	imageUrl?: string;
	metadata?: Record<string, unknown>;
};

export type ArticlePublishRequest = {
	destination: string;
	document: ArticleDocument;
	userId: string;
	airtableBrandId?: string;
	memoryId?: string;
	idempotencyKey?: string;
};

export type ArticlePublishResult = {
	ok: boolean;
	destination: string;
	externalId?: string;
	url?: string;
	error?: string;
	skipped?: boolean;
};

export type ArticlePublisher = {
	id: string;
	publish(request: ArticlePublishRequest): Promise<ArticlePublishResult>;
};
