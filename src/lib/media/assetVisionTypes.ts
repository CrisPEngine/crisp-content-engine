export type AssetVisionAnalysis = {
	summary: string;
	subjects: string[];
	brandEntities: string[];
	setting: string;
	colours: string[];
	mood: string;
	orientation: 'portrait' | 'landscape' | 'square' | 'unknown';
	cropSuitability: string;
	suggestedTopics: string[];
	altText: string;
	searchTags: string[];
	analyzedAt: string;
	model?: string;
};

export type AssetVisionAnalysisStatus = 'pending' | 'complete' | 'failed' | 'skipped';
