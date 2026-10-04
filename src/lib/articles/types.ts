export type ArticleSection = {
	id: string;
	heading: string;
	purpose: string;
	body: string;
	claims: string[];
};

export type ArticleResearch = {
	sources: Array<{ label: string; kind: 'brand_brain' | 'supplied' | 'opportunity'; url?: string; retrievedAt?: string }>;
	claims: Array<{ text: string; sourceLabel: string; confidence: 'stored' | 'supplied' }>;
	gaps: string[];
};

export type ArticleSeo = {
	title: string;
	seoTitle: string;
	slug: string;
	excerpt: string;
	metaDescription: string;
	canonical: string | null;
	primaryKeyword: string | null;
	secondaryTopics: string[];
};

export type ArticlePublication = {
	destination: string;
	externalId?: string;
	url?: string;
	publishedAt?: string;
	method: 'cce' | 'external';
};

export type ArticleRecord = {
	id: string;
	ownerUserId: string;
	brandId: string;
	objective: string;
	audience?: string;
	topic: string;
	searchIntent: string;
	primaryKeyword?: string;
	secondaryTopics: string[];
	research: ArticleResearch;
	outline: Array<{ id: string; heading: string; purpose: string }>;
	sections: ArticleSection[];
	title: string;
	slug: string;
	excerpt: string;
	body: string;
	seo: ArticleSeo;
	author: string | null;
	categories: string[];
	tags: string[];
	featuredAssetId?: string;
	inlineAssetIds: string[];
	mediaPlan: unknown;
	internalLinkOpportunities: string[];
	status: 'brief' | 'draft' | 'review' | 'approved' | 'published';
	approval: { required: true; approver: 'human'; status: 'pending' | 'approved' | 'rejected' };
	publishDestination?: string;
	publishAt?: string;
	publication: ArticlePublication | null;
	performanceContentId: string;
	wordCount: number;
	targetWords: number;
	review: { materialPassed: boolean; note: string; coherenceFindings?: string[] } | null;
	versions: Array<{ body: string; createdAt: string; instruction?: string }>;
	distribution: {
		disclosure: string | null;
		sponsorship: 'none' | 'sponsored' | 'partner' | 'affiliate';
		contentCluster: string | null;
		authorProfileId: string | null;
	};
	createdAt: string;
	updatedAt: string;
};
