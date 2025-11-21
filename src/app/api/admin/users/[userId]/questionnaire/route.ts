import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

async function checkAdmin(userId: string) {
	const supabase = await createClient();
	const { data: profile } = await supabase
		.from('profiles')
		.select('is_admin')
		.eq('id', userId)
		.single();
	return profile?.is_admin === true;
}

export async function GET(
	req: Request,
	context: { params: Promise<{ userId: string }> }
) {
	try {
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		
		if (!user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isAdmin = await checkAdmin(user.id);
		if (!isAdmin) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const { userId } = await context.params;

		// Get user's email for filename
		const admin = getSupabaseService();
		const { data: profile } = await admin
			.from('profiles')
			.select('email')
			.eq('id', userId)
			.single();

		const userEmail = profile?.email || userId;

		// Fetch brand profiles for this user from Airtable
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		const STRATEGYUPDATES_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch all brand profiles for this user
		const brandsRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}?filterByFormula={user_id}="${userId}"&sort[0][field]=created_time&sort[0][direction]=desc`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!brandsRes.ok) {
			return NextResponse.json(
				{ error: 'Failed to fetch brand profiles' },
				{ status: 502 }
			);
		}

		const brandsData = await brandsRes.json();
		const brands = brandsData.records || [];

		// Fetch monthly updates if table exists
		let monthlyUpdates: any[] = [];
		if (STRATEGYUPDATES_TABLE) {
			try {
				const updatesRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${STRATEGYUPDATES_TABLE}?filterByFormula={brand_profile_id}="${brands[0]?.id || ''}"&sort[0][field]=created_time&sort[0][direction]=desc`,
					{
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					}
				);
				if (updatesRes.ok) {
					const updatesData = await updatesRes.json();
					monthlyUpdates = updatesData.records || [];
				}
			} catch (error) {
				console.warn('Failed to fetch monthly updates:', error);
			}
		}

		// Format data for download
		const formatField = (value: any): string => {
			if (Array.isArray(value)) {
				return value.join(', ');
			}
			if (value === null || value === undefined) {
				return '';
			}
			return String(value);
		};

		const formatBrandProfile = (brand: any) => {
			const fields = brand.fields || {};
			return {
				'Brand Type': formatField(fields.brand_type),
				'Brand Name': formatField(fields.client_name),
				'Created': brand.createdTime ? new Date(brand.createdTime).toLocaleString() : '',
				'Status': formatField(fields.status),
				// Company fields
				'Website': formatField(fields.website),
				'Audience': formatField(fields.audience),
				'Value Props': formatField(fields.value_props),
				'Offers': formatField(fields.offers),
				'Brand Goals': formatField(fields.brand_goals),
				'Voice Rules': formatField(fields.voice_rules),
				'Brand Keywords': formatField(fields.brand_keywords),
				'Exclude Keywords': formatField(fields.exclude_keywords),
				'Content Rules': formatField(fields.content_rules),
				'Additional Info': formatField(fields.additional_info),
				'Platforms': formatField(fields.platforms_requested),
				'Timezone': formatField(fields.timezone),
				'Language/Region': formatField(fields.language_region),
				'Preferred Image Source': formatField(fields.preferred_image_source),
				'Brand Palette': formatField(fields.brand_palette),
				'Approval Contact Email': formatField(fields.approval_contact_email),
				// Personal brand fields
				'Full Name': formatField(fields.personal_full_name),
				'Job Title': formatField(fields.personal_job_title),
				'Industry': formatField(fields.personal_industry),
				'Website (Personal)': formatField(fields.personal_links),
				'Headline': formatField(fields.personal_headline),
				'Audience (Personal)': formatField(fields.personal_audience),
				'Expertise': formatField(fields.personal_expertise),
				'Goals (Personal)': formatField(fields.personal_goals),
				'Voice Traits': formatField(fields.personal_voice_traits),
				'Tone to Avoid': formatField(fields.personal_tone_avoid),
				'Risk Tolerance': formatField(fields.personal_risk_tolerance),
				'Content Style': formatField(fields.personal_content_style),
				'Exclude Keywords (Personal)': formatField(fields.personal_exclude_keywords),
				'Personal Story': formatField(fields.personal_story),
			};
		};

		const formatMonthlyUpdate = (update: any) => {
			const fields = update.fields || {};
			return {
				'Update Date': update.createdTime ? new Date(update.createdTime).toLocaleString() : '',
				'Objective': formatField(fields.objective),
				'Themes Focus': formatField(fields.themes_focus),
				'Key Dates': formatField(fields.key_dates),
				'Feedback Notes': formatField(fields.feedback_notes),
				'Content Preferences': formatField(fields.content_preferences),
			};
		};

		// Create CSV content
		const rows: string[][] = [];

		// Add header
		rows.push(['Questionnaire Export', `User: ${userEmail}`, `Generated: ${new Date().toLocaleString()}`]);
		rows.push([]);

		// Add initial onboarding questionnaires
		if (brands.length > 0) {
			rows.push(['=== INITIAL ONBOARDING QUESTIONNAIRES ===']);
			rows.push([]);
			
			brands.forEach((brand: any, index: number) => {
				rows.push([`Brand Profile ${index + 1}`]);
				const brandData = formatBrandProfile(brand);
				Object.entries(brandData).forEach(([key, value]) => {
					rows.push([key, String(value)]);
				});
				rows.push([]);
			});
		}

		// Add monthly updates
		if (monthlyUpdates.length > 0) {
			rows.push(['=== MONTHLY STRATEGY UPDATES ===']);
			rows.push([]);
			
			monthlyUpdates.forEach((update: any, index: number) => {
				rows.push([`Monthly Update ${index + 1}`]);
				const updateData = formatMonthlyUpdate(update);
				Object.entries(updateData).forEach(([key, value]) => {
					rows.push([key, String(value)]);
				});
				rows.push([]);
			});
		}

		// Convert to CSV
		const csv = rows.map(row => 
			row.map(cell => {
				// Escape quotes and wrap in quotes if contains comma, quote, or newline
				const cellStr = String(cell || '');
				if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
					return `"${cellStr.replace(/"/g, '""')}"`;
				}
				return cellStr;
			}).join(',')
		).join('\n');

		// Return as downloadable file
		return new NextResponse(csv, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="questionnaire-${userEmail}-${new Date().toISOString().split('T')[0]}.csv"`,
			},
		});
	} catch (error: any) {
		console.error('Questionnaire export error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to export questionnaire' },
			{ status: 500 }
		);
	}
}

