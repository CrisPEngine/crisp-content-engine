import type { ConfidenceLevel, Experiment, ExperimentAnalysis, OptimizationObjective } from './types';

export function metricForObjective(objective: OptimizationObjective | string): { primary: string; secondary: string[] } {
	switch (objective) {
		case 'website_traffic':
		case 'lead_generation':
		case 'conversion':
			return { primary: 'click_through_rate', secondary: ['clicks', 'conversions'] };
		case 'engagement':
		case 'community':
			return { primary: 'comments', secondary: ['engagement_rate', 'shares'] };
		case 'awareness':
		case 'launch_awareness':
			return { primary: 'reach', secondary: ['impressions', 'follower_growth'] };
		case 'authority':
		case 'education':
			return { primary: 'saves', secondary: ['comments', 'dwell_seconds'] };
		default:
			return { primary: 'engagement_rate', secondary: ['clicks', 'comments'] };
	}
}

export function analyseExperiment(input: {
	experiment: Experiment;
	results: Array<{ variantId: string; metric: string; absoluteValue?: number; normalisedValue?: number; sampleSize?: number }>;
}): ExperimentAnalysis {
	const { experiment, results } = input;
	const control = experiment.variants.find((row) => row.role === 'control');
	const variant = experiment.variants.find((row) => row.role === 'variant');
	if (!control || !variant) {
		return {
			experimentId: experiment.id,
			ready: false,
			confidence: 'insufficient',
			reason: 'Experiment needs both a control and a variant.',
			metricComparisons: [],
		};
	}

	const controlRows = results.filter((row) => row.variantId === control.id && row.metric === experiment.primaryMetric);
	const variantRows = results.filter((row) => row.variantId === variant.id && row.metric === experiment.primaryMetric);
	const controlSample = controlRows.reduce((sum, row) => sum + (row.sampleSize ?? 0), 0);
	const variantSample = variantRows.reduce((sum, row) => sum + (row.sampleSize ?? 0), 0);
	const controlValue = average(controlRows.map((row) => row.normalisedValue ?? row.absoluteValue));
	const variantValue = average(variantRows.map((row) => row.normalisedValue ?? row.absoluteValue));

	if (
		controlRows.length === 0 ||
		variantRows.length === 0 ||
		controlSample + variantSample < experiment.minimumSample ||
		controlValue === undefined ||
		variantValue === undefined
	) {
		return {
			experimentId: experiment.id,
			ready: false,
			confidence: 'insufficient',
			reason: `Need at least ${experiment.minimumSample} comparable observations on ${experiment.primaryMetric}. Social tests are not laboratory RCTs.`,
			metricComparisons: [
				{ metric: experiment.primaryMetric, control: controlValue, variant: variantValue },
			],
		};
	}

	const relativeLift = controlValue === 0 ? undefined : (variantValue - controlValue) / Math.abs(controlValue);
	const absDiff = Math.abs(variantValue - controlValue);
	const tiny = controlValue !== 0 ? Math.abs((variantValue - controlValue) / controlValue) < 0.08 : absDiff < 0.01;

	let confidence: ConfidenceLevel = 'low';
	if (controlSample + variantSample >= experiment.minimumSample * 3 && !tiny) confidence = 'moderate';
	if (controlSample + variantSample >= experiment.minimumSample * 6 && !tiny) confidence = 'high';
	if (tiny) confidence = 'low';

	const winnerVariantId = tiny ? undefined : variantValue > controlValue ? variant.id : control.id;
	const reason = tiny
		? 'Difference is too small to declare a winner. Keep running or redesign the variable.'
		: `Likely winner on ${experiment.primaryMetric} with ${confidence} confidence. Not causal certainty — platform algorithms and audience mix are uncontrolled.`;

	return {
		experimentId: experiment.id,
		ready: !tiny,
		winnerVariantId,
		confidence,
		reason,
		metricComparisons: [
			{
				metric: experiment.primaryMetric,
				control: controlValue,
				variant: variantValue,
				relativeLift,
			},
		],
		learning: winnerVariantId
			? `${experiment.variable}: ${winnerVariantId === variant.id ? variant.label : control.label} currently outperforms on ${experiment.primaryMetric} for objective "${experiment.objective}".`
			: undefined,
	};
}

function average(values: Array<number | undefined>): number | undefined {
	const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
	if (nums.length === 0) return undefined;
	return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export const PRAGMATIC_CONTROLS = [
	'same_account',
	'same_channel',
	'comparable_weekday',
	'comparable_time',
	'comparable_content_type',
	'comparable_audience_context',
] as const;
