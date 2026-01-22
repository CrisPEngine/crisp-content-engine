/**
 * Airtable API Client Wrapper
 * 
 * Centralized Airtable client with:
 * - Field selection enforcement
 * - Request coalescing (deduplicate concurrent identical requests)
 * - KV/Redis caching for production (with in-memory fallback)
 * - Batch update support
 * - Logging for API call tracking
 * - Uses field names in fields[] parameter, returnFieldsByFieldId=true for response keys
 */

function getAirtableConfig(): { token: string; baseId: string } {
	const token = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;

	if (!token || !baseId) {
		throw new Error('Airtable configuration missing: AIRTABLE_PAT and AIRTABLE_BASE_ID must be set');
	}

	return { token, baseId };
}

// In-flight request cache (prevents duplicate concurrent requests)
const inFlightRequests = new Map<string, Promise<any>>();

// Response cache with TTL (for BrandProfiles)
interface CacheEntry {
	data: any;
	expiresAt: number;
}

// In-memory cache (fallback if KV not available)
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// API call tracking for logging
interface ApiCallLog {
	endpoint: string;
	table: string;
	fieldsCount: number;
	timestamp: number;
	cached: boolean;
	coalesced: boolean;
}

const apiCallLogs: ApiCallLog[] = [];
const MAX_LOG_ENTRIES = 1000; // Keep last 1000 calls for analysis

function getCacheKey(table: string, params: Record<string, any>): string {
	return `${table}:${JSON.stringify(params)}`;
}

/**
 * Get cached data (checks KV/Redis first, then in-memory)
 */
async function getCached(key: string): Promise<any | null> {
	// Try KV/Redis first (production)
	if (typeof process !== 'undefined' && (process.env as any).KV) {
		try {
			const kv = (process.env as any).KV;
			const cached = await kv.get(key);
			if (cached) {
				const entry = JSON.parse(cached);
				if (entry.expiresAt > Date.now()) {
					return entry.data;
				}
				await kv.delete(key);
			}
		} catch (error) {
			console.warn('[Airtable Client] KV cache error, falling back to in-memory:', error);
		}
	}
	
	// Fallback to in-memory cache
	const entry = responseCache.get(key);
	if (entry && entry.expiresAt > Date.now()) {
		return entry.data;
	}
	if (entry) {
		responseCache.delete(key);
	}
	return null;
}

/**
 * Set cached data (stores in KV/Redis if available, otherwise in-memory)
 */
async function setCache(key: string, data: any): Promise<void> {
	const entry = {
		data,
		expiresAt: Date.now() + CACHE_TTL_MS,
	};
	
	// Try KV/Redis first (production)
	if (typeof process !== 'undefined' && (process.env as any).KV) {
		try {
			const kv = (process.env as any).KV;
			await kv.put(key, JSON.stringify(entry), { expirationTtl: Math.floor(CACHE_TTL_MS / 1000) });
			return;
		} catch (error) {
			console.warn('[Airtable Client] KV cache error, falling back to in-memory:', error);
		}
	}
	
	// Fallback to in-memory cache
	responseCache.set(key, entry);
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
	fields: string[]; // REQUIRED: Must specify fields (use field NAMES, not IDs)
	cache?: boolean; // Enable caching (default: false, true for BrandProfiles)
	returnFieldsByFieldId?: boolean; // Return responses keyed by field IDs (default: true)
	endpoint?: string; // Endpoint name for logging (e.g., '/api/brands')
}

/**
 * List records from Airtable
 * Enforces field selection and supports caching/request coalescing
 * 
 * IMPORTANT: 
 * - fields[] parameter must use FIELD NAMES (not IDs)
 * - Set returnFieldsByFieldId=true to get responses keyed by field IDs
 */
export async function listRecords(options: ListOptions): Promise<any[]> {
	const { 
		table, 
		filterByFormula, 
		sort, 
		maxRecords, 
		pageSize, 
		fields, 
		cache = false,
		returnFieldsByFieldId = true, // Default to true for stability
		endpoint = 'unknown'
	} = options;

	if (!fields || fields.length === 0) {
		throw new Error(`listRecords: fields array is required for table ${table}`);
	}

	const params: Record<string, any> = {
		filterByFormula,
		sort,
		maxRecords,
		pageSize,
		fields,
		returnFieldsByFieldId,
	};

	const cacheKey = cache ? getCacheKey(table, params) : null;
	let wasCached = false;
	let wasCoalesced = false;

	// Check cache first
	if (cache && cacheKey) {
		const cached = await getCached(cacheKey);
		if (cached) {
			console.log(`[Airtable Client] Cache hit for ${table} (endpoint: ${endpoint})`);
			wasCached = true;
			logApiCall(endpoint, table, fields.length, wasCached, wasCoalesced);
			return cached;
		}
	}

	// Check for in-flight request
	const requestKey = cacheKey || `${table}:${JSON.stringify(params)}`;
	if (inFlightRequests.has(requestKey)) {
		console.log(`[Airtable Client] Coalescing request for ${table} (endpoint: ${endpoint})`);
		wasCoalesced = true;
		const result = await inFlightRequests.get(requestKey)!;
		logApiCall(endpoint, table, fields.length, wasCached, wasCoalesced);
		return result;
	}

	const { token: airtableToken, baseId } = getAirtableConfig();
	// Build URL
	const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
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
	// Use field NAMES in fields[] parameter (Airtable API requirement)
	fields.forEach((field) => {
		url.searchParams.append('fields[]', field);
	});
	// Request responses keyed by field IDs for stability
	if (returnFieldsByFieldId) {
		url.searchParams.set('returnFieldsByFieldId', 'true');
	}

	// Create request promise
	const requestPromise = fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${airtableToken}`,
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
		.then(async (data) => {
			const records = data.records || [];
			// Cache if enabled
			if (cache && cacheKey) {
				await setCache(cacheKey, records);
			}
			// Log API call
			logApiCall(endpoint, table, fields.length, wasCached, wasCoalesced);
			console.log(`[Airtable Client] API call: ${endpoint} -> ${table} (${fields.length} fields, ${records.length} records)`);
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

/**
 * Log API call for tracking reduction
 */
function logApiCall(endpoint: string, table: string, fieldsCount: number, cached: boolean, coalesced: boolean): void {
	apiCallLogs.push({
		endpoint,
		table,
		fieldsCount,
		timestamp: Date.now(),
		cached,
		coalesced,
	});
	
	// Keep only last N entries
	if (apiCallLogs.length > MAX_LOG_ENTRIES) {
		apiCallLogs.shift();
	}
}

/**
 * Get API call statistics for an endpoint
 */
export function getApiCallStats(endpoint?: string): {
	total: number;
	cached: number;
	coalesced: number;
	actual: number; // actual API calls made
	byTable: Record<string, number>;
} {
	const filtered = endpoint 
		? apiCallLogs.filter(log => log.endpoint === endpoint)
		: apiCallLogs;
	
	const stats = {
		total: filtered.length,
		cached: filtered.filter(log => log.cached).length,
		coalesced: filtered.filter(log => log.coalesced).length,
		actual: filtered.filter(log => !log.cached && !log.coalesced).length,
		byTable: {} as Record<string, number>,
	};
	
	filtered.forEach(log => {
		stats.byTable[log.table] = (stats.byTable[log.table] || 0) + 1;
	});
	
	return stats;
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
	const { token: airtableToken, baseId } = getAirtableConfig();

	const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}/${recordId}`);
	if (fields && fields.length > 0) {
		fields.forEach((field) => {
			url.searchParams.append('fields[]', field);
		});
	}

	const res = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${airtableToken}`,
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
	const { token: airtableToken, baseId } = getAirtableConfig();

	const url = `https://api.airtable.com/v0/${baseId}/${table}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${airtableToken}`,
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
	const { token: airtableToken, baseId } = getAirtableConfig();

	const url = `https://api.airtable.com/v0/${baseId}/${table}/${recordId}`;
	const res = await fetch(url, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${airtableToken}`,
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
	const { token: airtableToken, baseId } = getAirtableConfig();

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

	const url = `https://api.airtable.com/v0/${baseId}/${table}`;
	const res = await fetch(url, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${airtableToken}`,
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
