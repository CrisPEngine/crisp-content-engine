import { NextResponse } from 'next/server';

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
		const brandProfileId: string | undefined = payload?.brand_profile_id;
		if (!brandProfileId) {
			return NextResponse.json({ ok: false, error: 'Missing brand_profile_id' }, { status: 400 });
		}

		const airtableToken = process.env.AIRTABLE_PAT;
		const baseId = process.env.AIRTABLE_BASE_ID;
		const tableId = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!airtableToken || !baseId || !tableId) {
			console.warn('Airtable credentials missing; skipping Airtable update.');
		} else {
			const recordId = payload?.airtable_record_id || brandProfileId;
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

			const summary = payload?.strategy_summary || payload?.summary;
			if (summary) {
				fields.strategy_summary = summary;
			}

			const strategyPayload =
				payload?.strategy_payload ||
				payload?.strategy ||
				payload?.strategy_sections ||
				payload?.strategy_content;
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
				const airtableRes = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`, {
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

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('strategy/webhook error:', error);
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
