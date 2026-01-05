/**
 * Airtable API Client Wrapper
 * 
 * Centralized Airtable client with:
 * - Field selection enforcement
 * - Request coalescing (deduplicate concurrent identical requests)
 * - Short TTL caching for BrandProfiles
 * - Batch update support
 */

const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_TOKEN || !BASE_ID) {
	throw new Error('Airtable configuration missing: AIRTABLE_PAT and AIRTABLE_BASE_ID must be set');
}

// In-flight request cache (prevents duplicate concurrent requests)
const inFlightRequests = new Map<string, Promise<any>>();

// Response cache with TTL (for BrandProfiles)
interface CacheEntry {
	data: any;
	expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(table: string, params: Record<string, any>): string {
	return `${table}:${JSON.stringify(params)}`;
}

function getCached(key: string): any | null {
	const entry = responseCache.get(key);
	if (entry && entry.expiresAt > Date.now()) {
		return entry.data;
	}
	if (entry) {
		responseCache.delete(key);
	}
	return null;
}

function setCache(key: string, data: any): void {
	responseCache.set(key, {
		data,
		expiresAt: Date.now() + CACHE_TTL_MS,
	});
}

/**
 * Normalize Airtable lookup field values (may be string or array)
 */
export function normalizeLookup(value: string | string[] | null | undefined): string | null {
	if (!value) return null;
	if (Array.isArray(value)) {
		return value[0] || null;
	}
	return value;
}

/**
 * Normalize multiple lookup fields from a record
 */
export function normalizeLookups(record: any, fields: string[]): Record<string, string | null> {
	const normalized: Record<string, string | null> = {};
	for (const field of fields) {
		normalized[field] = normalizeLookup(record.fields?.[field]);
	}
	return normalized;
}

interface ListOptions {
	table: string;
	filterByFormula?: string;
	sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
	maxRecords?: number;
	pageSize?: number;
	fields: string[]; // REQUIRED: Must specify fields
	cache?: boolean; // Enable caching (default: false, true for BrandProfiles)
}

/**
 * List records from Airtable
 * Enforces field selection and supports caching/request coalescing
 */
export async function listRecords(options: ListOptions): Promise<any[]> {
	const { table, filterByFormula, sort, maxRecords, pageSize, fields, cache = false } = options;

	if (!fields || fields.length === 0) {
		throw new Error(`listRecords: fields array is required for table ${table}`);
	}

	const params: Record<string, any> = {
		filterByFormula,
		sort,
		maxRecords,
		pageSize,
		fields,
	};

	const cacheKey = cache ? getCacheKey(table, params) : null;

	// Check cache first
	if (cache && cacheKey) {
		const cached = getCached(cacheKey);
		if (cached) {
			console.log(`[Airtable Client] Cache hit for ${table}`);
			return cached;
		}
	}

	// Check for in-flight request
	const requestKey = cacheKey || `${table}:${JSON.stringify(params)}`;
	if (inFlightRequests.has(requestKey)) {
		console.log(`[Airtable Client] Coalescing request for ${table}`);
		return inFlightRequests.get(requestKey)!;
	}

	// Build URL
	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${table}`);
	if (filterByFormula) {
		url.searchParams.set('filterByFormula', filterByFormula);
	}
	if (maxRecords) {
		url.searchParams.set('maxRecords', String(maxRecords));
	}
	if (pageSize) {
		url.searchParams.set('pageSize', String(pageSize));
	}
	if (sort && sort.length > 0) {
		sort.forEach((s, i) => {
			url.searchParams.set(`sort[${i}][field]`, s.field);
			url.searchParams.set(`sort[${i}][direction]`, s.direction);
		});
	}
	fields.forEach((field) => {
		url.searchParams.append('fields[]', field);
	});

	// Create request promise
	const requestPromise = fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
	})
		.then(async (res) => {
			if (!res.ok) {
				const errorText = await res.text();
				let errorData: any = {};
				try {
					errorData = JSON.parse(errorText);
				} catch {
					errorData = { message: errorText };
				}
				throw new Error(`Airtable API error: ${res.status} - ${JSON.stringify(errorData)}`);
			}
			return res.json();
		})
		.then((data) => {
			const records = data.records || [];
			// Cache if enabled
			if (cache && cacheKey) {
				setCache(cacheKey, records);
			}
			return records;
		})
		.finally(() => {
			// Remove from in-flight cache
			inFlightRequests.delete(requestKey);
		});

	// Store in-flight request
	inFlightRequests.set(requestKey, requestPromise);

	return requestPromise;
}

interface GetOptions {
	table: string;
	recordId: string;
	fields?: string[]; // Optional: if not provided, fetches all fields
}

/**
 * Get a single record by ID
 */
export async function getRecord(options: GetOptions): Promise<any> {
	const { table, recordId, fields } = options;

	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${table}/${recordId}`);
	if (fields && fields.length > 0) {
		fields.forEach((field) => {
			url.searchParams.append('fields[]', field);
		});
	}

	const res = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
	});

	if (!res.ok) {
		const errorText = await res.text();
		let errorData: any = {};
		try {
			errorData = JSON.parse(errorText);
		} catch {
			errorData = { message: errorText };
		}
		throw new Error(`Airtable API error: ${res.status} - ${JSON.stringify(errorData)}`);
	}

	const data = await res.json();
	return data;
}

interface CreateOptions {
	table: string;
	fields: Record<string, any>;
}

/**
 * Create a new record
 */
export async function createRecord(options: CreateOptions): Promise<any> {
	const { table, fields } = options;

	const url = `https://api.airtable.com/v0/${BASE_ID}/${table}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			fields,
		}),
	});

	if (!res.ok) {
		const errorText = await res.text();
		let errorData: any = {};
		try {
			errorData = JSON.parse(errorText);
		} catch {
			errorData = { message: errorText };
		}
		throw new Error(`Airtable API error: ${res.status} - ${JSON.stringify(errorData)}`);
	}

	const data = await res.json();
	return data;
}

interface UpdateOptions {
	table: string;
	recordId: string;
	fields: Record<string, any>;
}

/**
 * Update a single record
 */
export async function updateRecord(options: UpdateOptions): Promise<any> {
	const { table, recordId, fields } = options;

	const url = `https://api.airtable.com/v0/${BASE_ID}/${table}/${recordId}`;
	const res = await fetch(url, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			fields,
		}),
	});

	if (!res.ok) {
		const errorText = await res.text();
		let errorData: any = {};
		try {
			errorData = JSON.parse(errorText);
		} catch {
			errorData = { message: errorText };
		}
		throw new Error(`Airtable API error: ${res.status} - ${JSON.stringify(errorData)}`);
	}

	const data = await res.json();
	return data;
}

interface BatchUpdateOptions {
	table: string;
	records: Array<{ id: string; fields: Record<string, any> }>;
}

/**
 * Batch update multiple records (up to 10 per Airtable API limit)
 */
export async function batchUpdate(options: BatchUpdateOptions): Promise<any[]> {
	const { table, records } = options;

	if (records.length === 0) {
		return [];
	}

	if (records.length > 10) {
		// Split into batches of 10
		const batches: Array<Array<{ id: string; fields: Record<string, any> }>> = [];
		for (let i = 0; i < records.length; i += 10) {
			batches.push(records.slice(i, i + 10));
		}

		const results = await Promise.all(
			batches.map((batch) => batchUpdate({ table, records: batch }))
		);
		return results.flat();
	}

	const url = `https://api.airtable.com/v0/${BASE_ID}/${table}`;
	const res = await fetch(url, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			records: records.map((r) => ({
				id: r.id,
				fields: r.fields,
			})),
		}),
	});

	if (!res.ok) {
		const errorText = await res.text();
		let errorData: any = {};
		try {
			errorData = JSON.parse(errorText);
		} catch {
			errorData = { message: errorText };
		}
		throw new Error(`Airtable API error: ${res.status} - ${JSON.stringify(errorData)}`);
	}

	const data = await res.json();
	return data.records || [];
}

/**
 * Clear cache (useful for testing or after updates)
 */
export function clearCache(): void {
	responseCache.clear();
}
