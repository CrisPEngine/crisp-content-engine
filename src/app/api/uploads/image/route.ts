import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { uploadImageFromBuffer } from '@/lib/cloudinary';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_MB = parseInt(process.env.CLOUDINARY_MAX_FILE_SIZE_MB || '2', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export async function POST(req: Request) {
	try {
		// Authenticate user
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

		const { data: { user }, error: userError } = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check Cloudinary configuration
		if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
			console.error('Cloudinary configuration missing');
			return NextResponse.json(
				{ error: 'Image upload service not configured' },
				{ status: 500 }
			);
		}

		// Parse multipart form data
		const formData = await req.formData();
		const file = formData.get('file') as File | null;

		if (!file) {
			return NextResponse.json({ error: 'No file provided' }, { status: 400 });
		}

		// Validate file type
		if (!ALLOWED_MIME_TYPES.includes(file.type)) {
			return NextResponse.json(
				{ error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` },
				{ status: 400 }
			);
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE_BYTES) {
			return NextResponse.json(
				{ error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB` },
				{ status: 400 }
			);
		}

		// Convert file to buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Upload to Cloudinary
		const result = await uploadImageFromBuffer(buffer, file.name);

		return NextResponse.json({
			secureUrl: result.secure_url,
			publicId: result.public_id,
			width: result.width,
			height: result.height,
		});
	} catch (error: any) {
		console.error('Image upload error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to upload image' },
			{ status: 500 }
		);
	}
}

