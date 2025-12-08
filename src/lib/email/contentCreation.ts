/**
 * Helper function to trigger content creation webhook when strategy is confirmed
 */

export async function triggerContentCreationForBrand(
	brandProfileId: string,
	userId: string,
	personUrn?: string | null,
	organizationUrn?: string | null
): Promise<{ success: boolean; error?: string }> {
	const webhookUrl = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL || process.env.CONTENT_CREATION_WEBHOOK_URL;

	if (!webhookUrl) {
		console.warn('[Content Creation] Webhook URL not configured. Cannot trigger content creation.');
		return { success: false, error: 'Content creation webhook not configured' };
	}

	try {
		// Get brand details from Airtable to determine brand type
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		let brandType = 'company';
		let strategyJson = null;
		let strategySummary = null;
		let platformsRequested: string[] = [];

		if (AIRTABLE_TOKEN && BASE_ID && BRANDPROFILES_TABLE) {
			try {
				const brandRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
					{
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					}
				);

				if (brandRes.ok) {
					const brandData = await brandRes.json();
					const fields = brandData.fields || {};
					brandType = fields.brand_type || 'company';
					strategyJson = fields.strategy_json || fields.strategy_payload;
					strategySummary = fields.strategy_summary || '';
					platformsRequested = Array.isArray(fields.platforms_requested)
						? fields.platforms_requested
						: [];
				}
			} catch (error) {
				console.warn('[Content Creation] Failed to fetch brand details:', error);
			}
		}

		// Prepare payload for Make webhook
		const payload = {
			brand_profile_id: brandProfileId,
			user_id: userId,
			person_urn: personUrn || null,
			organization_urn: organizationUrn || null,
			brand_type: brandType,
			strategy_json: strategyJson,
			strategy_summary: strategySummary,
			platforms_requested: platformsRequested,
			triggered_at: new Date().toISOString(),
			trigger_type: 'strategy_confirmed', // Indicates this was triggered by strategy confirmation
		};

		// Call Make webhook
		const webhookRes = await fetch(webhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET || process.env.CONTENT_WEBHOOK_SECRET
					? {
							'x-make-secret':
								process.env.MAKE_CONTENT_WEBHOOK_SECRET ||
								process.env.MAKE_SHARED_SECRET ||
								process.env.CONTENT_WEBHOOK_SECRET ||
								'',
						}
					: {}),
			},
			body: JSON.stringify(payload),
		});

		if (!webhookRes.ok) {
			const errorText = await webhookRes.text();
			console.error('[Content Creation] Webhook failed:', {
				status: webhookRes.status,
				error: errorText,
				brandProfileId,
			});
			return { success: false, error: `Webhook failed: ${errorText}` };
		}

		console.log(`[Content Creation] Successfully triggered content creation for brand ${brandProfileId}`);
		return { success: true };
	} catch (error: any) {
		console.error('[Content Creation] Error triggering webhook:', error);
		return { success: false, error: error?.message || 'Unknown error' };
	}
}


