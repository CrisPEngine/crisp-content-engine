import { GoogleProviderError } from './googleAuth';

export type Ga4LandingPage = {
	landingPage: string;
	sessions: number | null;
	engagementRate: number | null;
	averageSessionDuration: number | null;
	keyEvents: number | null;
};

export type Ga4Source = {
	channel: string | null;
	source: string | null;
	medium: string | null;
	sessions: number | null;
};

export type Ga4Report = {
	propertyId: string;
	startDate: string;
	endDate: string;
	retrievedAt: string;
	keyEvents: 'included' | 'unavailable';
	organic: {
		sessions: number | null;
		engagementRate: number | null;
		averageSessionDuration: number | null;
		keyEvents: number | null;
	};
	landingPages: Ga4LandingPage[];
	sources: Ga4Source[];
};

type ReportRow = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
type ReportResponse = { rows?: ReportRow[] };

function numberOrNull(value: string | undefined): number | null {
	if (value == null || value === '' || value === '(not set)') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

async function googleFailure(response: Response): Promise<never> {
	let code = 'ga4_failed';
	if (response.status === 401) code = 'ga4_unauthorized';
	if (response.status === 403) code = 'ga4_forbidden';
	if (response.status === 429) code = 'ga4_quota';
	let message = `GA4 request failed (${response.status}).`;
	try {
		const body = (await response.json()) as { error?: { message?: string } };
		const apiMessage = body.error?.message;
		if (typeof apiMessage === 'string' && apiMessage.length > 0 && apiMessage.length < 300 && !/private_key|BEGIN PRIVATE KEY/i.test(apiMessage)) {
			message = apiMessage;
		}
	} catch {
		/* keep the status message */
	}
	if (response.status === 403) message = `${message} Grant the service account Viewer access on this GA4 property.`;
	if (response.status === 429) message = `${message} The GA4 quota was reached. Wait before trying again.`;
	throw new GoogleProviderError(message, code, response.status);
}

function propertyPath(propertyId: string): string {
	const id = propertyId.trim().replace(/^properties\//, '');
	if (!/^[0-9]+$/.test(id)) throw new GoogleProviderError('GOOGLE_ANALYTICS_PROPERTY_ID must be the numeric GA4 property id.', 'ga4_property_invalid');
	return id;
}

export async function fetchGa4Report(input: {
	propertyId: string;
	startDate: string;
	endDate: string;
	accessToken: string;
	fetchImpl?: typeof fetch;
	pageSize?: number;
	maxRows?: number;
}): Promise<Ga4Report> {
	const propertyId = propertyPath(input.propertyId);
	const fetchImpl = input.fetchImpl ?? fetch;
	const pageSize = Math.min(Math.max(input.pageSize ?? 100, 1), 10000);
	const maxRows = Math.min(Math.max(input.maxRows ?? 500, 1), 2000);
	const retrievedAt = new Date().toISOString();
	const headers = { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' };
	const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}`;

	const metadataResponse = await fetchImpl(`${base}/metadata`, { headers });
	if (!metadataResponse.ok) await googleFailure(metadataResponse);
	const metadata = (await metadataResponse.json()) as { metrics?: Array<{ apiName?: string }> };
	const keyEventsAvailable = (metadata.metrics ?? []).some((metric) => metric.apiName === 'keyEvents');
	const performanceMetrics = [
		{ name: 'sessions' },
		{ name: 'engagementRate' },
		{ name: 'averageSessionDuration' },
		...(keyEventsAvailable ? [{ name: 'keyEvents' }] : []),
	];
	const organicFilter = {
		filter: {
			fieldName: 'sessionDefaultChannelGroup',
			stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
		},
	};

	async function run(body: Record<string, unknown>): Promise<ReportRow[]> {
		const collected: ReportRow[] = [];
		let offset = 0;
		while (collected.length < maxRows) {
			const limit = Math.min(pageSize, maxRows - collected.length);
			const response = await fetchImpl(`${base}:runReport`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ ...body, limit, offset }),
			});
			if (!response.ok) await googleFailure(response);
			const report = (await response.json()) as ReportResponse;
			const rows = report.rows ?? [];
			collected.push(...rows);
			if (rows.length < limit) break;
			offset += rows.length;
		}
		return collected;
	}

	const organicRows = await run({
		dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
		metrics: performanceMetrics,
		dimensionFilter: organicFilter,
	});
	const landingRows = await run({
		dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
		dimensions: [{ name: 'landingPage' }],
		metrics: performanceMetrics,
		dimensionFilter: organicFilter,
	});
	const sourceRows = await run({
		dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
		dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }, { name: 'sessionMedium' }],
		metrics: [{ name: 'sessions' }],
	});
	const organic = organicRows[0];
	return {
		propertyId,
		startDate: input.startDate,
		endDate: input.endDate,
		retrievedAt,
		keyEvents: keyEventsAvailable ? 'included' : 'unavailable',
		organic: {
			sessions: organic ? numberOrNull(organic.metricValues?.[0]?.value) : null,
			engagementRate: organic ? numberOrNull(organic.metricValues?.[1]?.value) : null,
			averageSessionDuration: organic ? numberOrNull(organic.metricValues?.[2]?.value) : null,
			keyEvents: keyEventsAvailable && organic ? numberOrNull(organic.metricValues?.[3]?.value) : null,
		},
		landingPages: landingRows.flatMap((row) => {
			const landingPage = row.dimensionValues?.[0]?.value?.trim();
			if (!landingPage) return [];
			return [{
				landingPage,
				sessions: numberOrNull(row.metricValues?.[0]?.value),
				engagementRate: numberOrNull(row.metricValues?.[1]?.value),
				averageSessionDuration: numberOrNull(row.metricValues?.[2]?.value),
				keyEvents: keyEventsAvailable ? numberOrNull(row.metricValues?.[3]?.value) : null,
			}];
		}),
		sources: sourceRows.map((row) => ({
			channel: row.dimensionValues?.[0]?.value ?? null,
			source: row.dimensionValues?.[1]?.value ?? null,
			medium: row.dimensionValues?.[2]?.value ?? null,
			sessions: numberOrNull(row.metricValues?.[0]?.value),
		})),
	};
}
