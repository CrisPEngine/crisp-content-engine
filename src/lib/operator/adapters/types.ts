import type {
	CreateOrUpdateBrandProfileInput,
	FetchBrandContentQueueInput,
	GenerateContentBatchInput,
	GenerateOrRefreshBrandStrategyInput,
	RegenerateIndividualPostInput,
	ScheduleApprovedContentInput,
	SendItemToApprovalInput,
	UpdateContentStatusInput,
} from '../actions/schemas';

export type AdapterResult = {
	provider: 'airtable' | 'make' | 'native';
	recordId?: string;
	payload?: unknown;
	response?: unknown;
	message?: string;
};

export type BrandRecord = {
	id: string;
	fields: Record<string, unknown>;
	createdTime?: string;
};

export type ContentRecord = {
	id: string;
	fields: Record<string, unknown>;
	createdTime?: string;
};

export interface BrandProfileAdapter {
	createOrUpdateBrandProfile(input: CreateOrUpdateBrandProfileInput, dryRun: boolean): Promise<AdapterResult>;
	getBrandProfile(brandProfileId: string): Promise<BrandRecord>;
}

export interface ContentQueueAdapter {
	getContentItem(contentId: string): Promise<ContentRecord>;
	updateContentStatus(input: UpdateContentStatusInput, dryRun: boolean): Promise<AdapterResult>;
	sendItemToApproval(input: SendItemToApprovalInput, dryRun: boolean): Promise<AdapterResult>;
	scheduleApprovedContent(input: ScheduleApprovedContentInput, dryRun: boolean): Promise<AdapterResult>;
	fetchBrandContentQueue(input: FetchBrandContentQueueInput): Promise<AdapterResult & { items: unknown[] }>;
}

export interface MakeAdapter {
	generateOrRefreshBrandStrategy(input: GenerateOrRefreshBrandStrategyInput, brand: BrandRecord, dryRun: boolean): Promise<AdapterResult>;
	generateContentBatch(input: GenerateContentBatchInput, brand: BrandRecord, dryRun: boolean): Promise<AdapterResult>;
	regenerateIndividualPost(input: RegenerateIndividualPostInput, content: ContentRecord, dryRun: boolean): Promise<AdapterResult>;
}

export type OperatorAdapters = {
	brands: BrandProfileAdapter;
	content: ContentQueueAdapter;
	make: MakeAdapter;
};
