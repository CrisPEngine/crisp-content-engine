export type GetStartedInputs = {
	strategyApproved: boolean;
	phase: string;
	pendingNative: number;
	assetCount: number;
	connected: number;
};

export function computeGetStartedCurrentStep(input: GetStartedInputs): number {
	const { strategyApproved, phase, pendingNative, assetCount, connected } = input;
	if (phase === 'generating') return 2;
	if (!strategyApproved) return 2;
	if (pendingNative > 0) return 5;
	const generateDone = assetCount > 0 || pendingNative > 0;
	if (!generateDone) return 3;
	if (connected === 0) return 4;
	return 0;
}

export function computeGetStartedStepDone(input: GetStartedInputs): {
	questionnaire: boolean;
	approve_strategy: boolean;
	generate_content: boolean;
	connect_social: boolean;
	review_content: boolean;
} {
	const { strategyApproved, pendingNative, assetCount, connected } = input;
	const generateDone = strategyApproved && (assetCount > 0 || pendingNative > 0);
	const connectDone = generateDone && connected > 0;
	const reviewDone = strategyApproved && generateDone && pendingNative === 0;
	return {
		questionnaire: true,
		approve_strategy: strategyApproved,
		generate_content: generateDone,
		connect_social: connectDone,
		review_content: reviewDone,
	};
}
