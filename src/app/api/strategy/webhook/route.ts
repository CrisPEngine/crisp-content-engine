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

const generateStrategySummary = (strategy: any): string => {
	if (!strategy || typeof strategy !== 'object') return '';
	
	const lines: string[] = [];
	
	// Brand Summary
	if (strategy.brand_summary) {
		if (strategy.brand_summary.one_liner) {
			lines.push(`📌 ${strategy.brand_summary.one_liner}`);
		}
		if (strategy.brand_summary.positioning) {
			lines.push(`\n${strategy.brand_summary.positioning}`);
		}
	}
	
	// Brand Understanding
	if (strategy.brand_understanding) {
		if (strategy.brand_understanding.summary) {
			lines.push(`\n\n## Brand Understanding\n${strategy.brand_understanding.summary}`);
		}
		if (strategy.brand_understanding.perceived_audience) {
			lines.push(`\n**Target Audience:** ${strategy.brand_understanding.perceived_audience}`);
		}
		if (strategy.brand_understanding.tone_description) {
			lines.push(`\n**Tone:** ${strategy.brand_understanding.tone_description}`);
		}
	}
	
	// Content Pillars
	if (strategy.pillars && Array.isArray(strategy.pillars) && strategy.pillars.length > 0) {
		lines.push(`\n\n## Content Pillars`);
		strategy.pillars.forEach((pillar: any, index: number) => {
			if (pillar.name) {
				lines.push(`\n${index + 1}. **${pillar.name}**`);
				if (pillar.why) {
					lines.push(`   ${pillar.why}`);
				}
			}
		});
	}
	
	// Posting Cadence
	if (strategy.cadence) {
		lines.push(`\n\n## Posting Schedule`);
		Object.entries(strategy.cadence).forEach(([platform, frequency]) => {
			if (frequency && String(frequency).trim()) {
				lines.push(`- **${platform}:** ${frequency}`);
			}
		});
	}
	
	// Content Mix
	if (strategy.post_mix) {
		lines.push(`\n\n## Content Mix`);
		if (strategy.post_mix.thought_leadership_pct) {
			lines.push(`- Thought Leadership: ${strategy.post_mix.thought_leadership_pct}%`);
		}
		if (strategy.post_mix.educational_pct) {
			lines.push(`- Educational: ${strategy.post_mix.educational_pct}%`);
		}
		if (strategy.post_mix.promo_pct) {
			lines.push(`- Promotional: ${strategy.post_mix.promo_pct}%`);
		}
		if (strategy.post_mix.community_pct) {
			lines.push(`- Community: ${strategy.post_mix.community_pct}%`);
		}
	}
	
	// Voice Guidelines
	if (strategy.voice) {
		lines.push(`\n\n## Voice Guidelines`);
		if (strategy.voice.summary) {
			lines.push(`\n${strategy.voice.summary}`);
		}
		if (strategy.voice.dos && Array.isArray(strategy.voice.dos) && strategy.voice.dos.length > 0) {
			lines.push(`\n**Do:**`);
			strategy.voice.dos.forEach((doItem: string) => {
				lines.push(`- ${doItem}`);
			});
		}
		if (strategy.voice.donts && Array.isArray(strategy.voice.donts) && strategy.voice.donts.length > 0) {
			lines.push(`\n**Don't:**`);
			strategy.voice.donts.forEach((dont: string) => {
				lines.push(`- ${dont}`);
			});
		}
	}
	
	// KPIs
	if (strategy.kpis) {
		lines.push(`\n\n## Key Performance Indicators`);
		if (strategy.kpis.primary) {
			lines.push(`- **Primary:** ${strategy.kpis.primary}`);
		}
		if (strategy.kpis.secondary) {
			lines.push(`- **Secondary:** ${strategy.kpis.secondary}`);
		}
	}
	
	return lines.join('\n').trim();
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
				const status = payload?.status || 'Completed'; // Default to Completed for monthly updates
				const processedAt = payload?.processed_at || new Date().toISOString();

				const fields: Record<string, any> = {
					status,
					processed_at: processedAt,
				};

				// Include result_payload if provided
				if (payload?.result_payload) {
					fields.result_payload = typeof payload.result_payload === 'string' 
						? payload.result_payload 
						: JSON.stringify(payload.result_payload);
				}

				// Include error message if status is Failed
				if (status === 'Failed' && payload?.error_message) {
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
			
			// Generate human-readable summary from strategy JSON if not provided
			let summary = payload?.strategy_summary || payload?.summary;
			if (!summary && strategyPayload) {
				try {
					const strategyData = typeof strategyPayload === 'string' 
						? JSON.parse(strategyPayload) 
						: strategyPayload;
					summary = generateStrategySummary(strategyData);
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

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('strategy/webhook error:', error);
		return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
	}
}
