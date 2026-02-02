import { NextResponse } from 'next/server';
import { generateStrategySummary } from './generateStrategySummary';

export const runtime = 'nodejs';

const normaliseStatus = (status?: string) => {
	if (!status) return 'Strategy Ready';
	if (status === 'Strategy Ready (Awaiting Approval)') return 'Strategy Ready';
	return status;
};

const serialiseField = (value: unknown) => {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
};

export async function POST(req: Request) {
	try {
		const sharedSecret = process.env.MAKE_CALLBACK_SECRET;
		if (sharedSecret) {
			const headerSecret = req.headers.get('x-make-secret');
			if (headerSecret !== sharedSecret) {
				return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
			}
		}

		const payload = await req.json();
		
		// Log the payload for debugging
		console.log('[Strategy Webhook] Received callback:', {
			mode: payload?.mode,
			strategy_update_id: payload?.strategy_update_id,
			brand_profile_id: payload?.brand_profile_id,
			status: payload?.status,
			strategy_status: payload?.strategy_status,
		});
		
		const brandProfileId: string | undefined = payload?.brand_profile_id;
		const strategyUpdateId: string | undefined = payload?.strategy_update_id;
		const mode: string | undefined = payload?.mode;
		
		// For monthly_update mode, we need to update StrategyUpdates table
		const isMonthlyUpdate = mode === 'monthly_update' || !!strategyUpdateId;
		
		if (!brandProfileId && !strategyUpdateId) {
			return NextResponse.json({ ok: false, error: 'Missing brand_profile_id or strategy_update_id' }, { status: 400 });
		}

		const airtableToken = process.env.AIRTABLE_PAT;
		const baseId = process.env.AIRTABLE_BASE_ID;
		const brandProfilesTableId = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		const strategyUpdatesTableId = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;

		// Update StrategyUpdates table if this is a monthly update
		if (isMonthlyUpdate && strategyUpdateId) {
			if (!airtableToken || !baseId || !strategyUpdatesTableId) {
				console.warn('Airtable credentials missing; skipping StrategyUpdates update.');
			} else {
				// Map status to valid content brief status options
				// Valid options: 'Draft', 'Pending Approval', 'Approved', 'Sent to Make', 'Generation Completed', 'Failed', 'Processing'
				let status = payload?.status;
				if (!status && payload?.strategy_status) {
					// Map BrandProfiles strategy_status to StrategyUpdates status
					const strategyStatus = payload.strategy_status.toLowerCase();
					if (strategyStatus.includes('ready') || strategyStatus.includes('completed')) {
						status = 'Pending Approval'; // Map strategy ready to pending approval for briefs
					} else if (strategyStatus.includes('fail')) {
						status = 'Failed';
					} else {
						status = 'Processing'; // Default for other strategy statuses
					}
				}
				// Default to Processing if still no status
				if (!status) {
					status = 'Processing';
				}
				
				const fields: Record<string, any> = {
					status,
				};

				// Only include processed_at if explicitly provided (field might not exist or have different type)
				// Skip processed_at to avoid field type errors - let Make.com handle it if needed
				// if (payload?.processed_at) {
				// 	try {
				// 		const date = new Date(payload.processed_at);
				// 		if (!isNaN(date.getTime())) {
				// 			// Try date-only format (YYYY-MM-DD)
				// 			fields.processed_at = date.toISOString().split('T')[0];
				// 		}
				// 	} catch {
				// 		// Skip if we can't parse it
				// 	}
				// }

				// Include result_payload if provided (field might not exist)
				if (payload?.result_payload) {
					try {
						fields.result_payload = typeof payload.result_payload === 'string' 
							? payload.result_payload 
							: JSON.stringify(payload.result_payload);
					} catch {
						// Skip if serialization fails
					}
				}

				// Include error message if status indicates failure
				const isFailed = status === 'Failed' || status?.toLowerCase().includes('fail');
				if (isFailed && payload?.error_message) {
					fields.last_error = payload.error_message;
				}

				try {
					const airtableRes = await fetch(`https://api.airtable.com/v0/${baseId}/${strategyUpdatesTableId}/${strategyUpdateId}`, {
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${airtableToken}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ fields }),
					});

					if (!airtableRes.ok) {
						const errorText = await airtableRes.text();
						console.error('Airtable StrategyUpdates update failed:', {
							strategyUpdateId,
							status: airtableRes.status,
							error: errorText,
						});
					} else {
						console.log('[Strategy Webhook] Updated StrategyUpdates record:', {
							strategyUpdateId,
							status,
						});
					}
				} catch (error) {
					console.error('Error updating StrategyUpdates record:', error);
				}
			}
		}

		// Update BrandProfiles table (original behavior)
		if (!airtableToken || !baseId || !brandProfilesTableId) {
			if (!isMonthlyUpdate) {
				console.warn('Airtable credentials missing; skipping Airtable update.');
			}
		} else {
			const recordId = payload?.airtable_record_id || brandProfileId;
			if (!recordId) {
				// Skip BrandProfiles update if no recordId (for monthly_update-only callbacks)
				if (!isMonthlyUpdate) {
					console.warn('No recordId provided; skipping BrandProfiles update.');
				}
			} else {
				const status = normaliseStatus(payload?.strategy_status);

				// Parse and validate updated_at date
				let updatedAt: string;
				if (payload?.updated_at) {
					try {
						// Try to parse the date and convert to ISO string
						const date = new Date(payload.updated_at);
						if (isNaN(date.getTime())) {
							// Invalid date, use current time
							updatedAt = new Date().toISOString();
						} else {
							updatedAt = date.toISOString();
						}
					} catch {
						updatedAt = new Date().toISOString();
					}
				} else {
					updatedAt = new Date().toISOString();
				}

				const fields: Record<string, any> = {
					status,
					strategy_status: status,
					strategy_updated_at: updatedAt,
				};

				const strategyPayload =
					payload?.strategy_payload ||
					payload?.strategy ||
					payload?.strategy_sections ||
					payload?.strategy_content;
				
				// When Make sends the full strategy JSON (strategy_payload), generate the full human-readable summary from it
				// so the strategy page shows the complete strategy. Only use payload.strategy_summary if no payload or generation fails.
				let summary = payload?.strategy_summary || payload?.summary;
				if (strategyPayload) {
					try {
						const strategyData = typeof strategyPayload === 'string'
							? JSON.parse(strategyPayload)
							: strategyPayload;
						const generated = generateStrategySummary(strategyData);
						if (generated) summary = generated;
					} catch (error) {
						console.warn('Failed to generate strategy summary:', error);
					}
				}
				if (summary) {
					fields.strategy_summary = summary;
				}

				if (strategyPayload) {
					// Use strategy_json as the field name in Airtable
					fields.strategy_json = serialiseField(strategyPayload);
				}

				// Optional fields - include if provided
				if (payload?.meta) {
					fields.strategy_meta = serialiseField(payload.meta);
				}
				
				if (payload?.pages_scraped !== undefined) {
					fields.strategy_pages_scraped = payload.pages_scraped;
				}
				
				if (payload?.text_chars !== undefined) {
					fields.strategy_text_chars = payload.text_chars;
				}

				const sanitisedFields = Object.fromEntries(
					Object.entries(fields).filter(([, value]) => value !== undefined)
				);

				try {
					const airtableRes = await fetch(`https://api.airtable.com/v0/${baseId}/${brandProfilesTableId}/${recordId}`, {
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${airtableToken}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ fields: sanitisedFields }),
					});

					if (!airtableRes.ok) {
						const errorText = await airtableRes.text();
						let errorData: any = {};
						try {
							errorData = JSON.parse(errorText);
						} catch {
							errorData = { message: errorText };
						}
						
						console.error('Airtable strategy update failed:', {
							error: errorData,
							fieldsAttempted: Object.keys(sanitisedFields),
							fieldValues: sanitisedFields,
							recordId,
							payload: {
								brand_profile_id: payload?.brand_profile_id,
								strategy_status: payload?.strategy_status,
								has_strategy: !!strategyPayload,
							},
						});
						
						const errorMessage = errorData?.error?.message || errorData?.message || 'Failed to update Airtable';
						const isFieldError = errorData?.error?.type === 'UNKNOWN_FIELD_NAME' || errorData?.error?.type === 'INVALID_VALUE_FOR_COLUMN';
						
						return NextResponse.json(
							{ 
								ok: false, 
								error: errorMessage,
								details: errorData,
								fieldsAttempted: Object.keys(sanitisedFields),
								hint: isFieldError 
									? `Missing or invalid field in Airtable. Check that these fields exist: ${Object.keys(sanitisedFields).join(', ')}`
									: undefined,
							}, 
							{ status: 502 }
						);
					}
				} catch (error) {
					console.error('Error updating Airtable strategy record:', error);
					return NextResponse.json({ ok: false, error: 'Failed to update Airtable' }, { status: 500 });
				}
			}
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('strategy/webhook error:', error);
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
