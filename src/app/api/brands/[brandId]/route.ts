import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function DELETE(
	request: Request,
	context: { params: Promise<{ brandId: string }> }
) {
	try {
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) {
						return cookieStore.get(name)?.value;
					},
					set(name: string, value: string, options: CookieOptions) {
						cookieStore.set({ name, value, ...options });
					},
					remove(name: string, options: CookieOptions) {
						cookieStore.set({ name, value: '', ...options });
					},
				},
			}
		);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		const { brandId } = await context.params;

		// Verify user owns this brand before deleting
		const brandUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandId}`;
		const brandRes = await fetch(brandUrl, {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!brandRes.ok) {
			const data = await brandRes.json();
			return NextResponse.json(
				{ error: data?.error?.message || 'Brand not found' },
				{ status: 404 }
			);
		}

		const brandData = await brandRes.json();
		if (brandData.fields?.user_id !== user.id) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Delete the brand from Airtable
		const deleteRes = await fetch(brandUrl, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!deleteRes.ok) {
			const deleteResult = await deleteRes.json();
			console.error('Airtable delete error:', deleteResult);
			return NextResponse.json(
				{ error: deleteResult?.error?.message || 'Failed to delete brand' },
				{ status: 502 }
			);
		}

		return NextResponse.json({ ok: true, message: 'Brand deleted successfully' });
	} catch (error: any) {
		console.error('Delete brand error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}

