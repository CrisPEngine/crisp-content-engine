import 'server-only';

export const IDEA_ENGINE_CHANNELS = ['LinkedIn', 'X', 'Blog', 'Instagram', 'Facebook'] as const;
export type IdeaEngineChannel = (typeof IDEA_ENGINE_CHANNELS)[number];

export type BrandContext = Record<string, unknown>;

export type PreviousContentEntry = Record<string, unknown>;

export type IdeaEngineRunContext = {
	seriesRunId: string;
	runId: string;
	userId: string;
	plan: string;
	brandProfileId: string;
	idea: string;
	goal: string | null;
	notes: string | null;
	selectedChannels: string[];
	publishMode: string;
	requestedCounts: Record<string, number>;
	quotaRemainingByChannel: Record<string, number>;
	autopublishCapabilities: Record<string, boolean>;
	timezone: string;
	postingWindows: unknown;
	brandContext: BrandContext;
	previousContentJson: PreviousContentEntry[];
};

export type GeneratedItemInput = {
	channel: string;
	post_title?: string | null;
	post_type?: string | null;
	hook?: string | null;
	body_draft?: string | null;
	hashtags?: string | null;
	image_prompt?: unknown;
	series_position?: number;
	series_total?: number;
	scheduled_time?: string | null;
};
