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

			const fields: Record<string, any> = {
				status,
				strategy_status: status,
				strategy_updated_at: payload?.updated_at || new Date().toISOString(),
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
				fields.strategy_payload = serialiseField(strategyPayload);
			}

			if (payload?.meta) {
				fields.strategy_meta = serialiseField(payload.meta);
			}

			if (payload?.pages_scraped) {
				fields.strategy_pages_scraped = payload.pages_scraped;
			}

			if (payload?.text_chars) {
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
					console.error('Airtable strategy update failed:', errorText);
					return NextResponse.json({ ok: false, error: 'Failed to update Airtable' }, { status: 502 });
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
