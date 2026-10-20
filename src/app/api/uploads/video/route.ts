import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { uploadVideoFromBuffer } from '@/lib/cloudinary';
import { getNativeContentStore } from '@/lib/media/store';

export const runtime = 'nodejs';

const MAX_MB = parseInt(process.env.CLOUDINARY_MAX_VIDEO_SIZE_MB || '50', 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ALLOWED = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

export async function POST(req: Request) {
	const cookieStore = await cookies();
	const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
	});
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const formData = await req.formData();
	const file = formData.get('file') as File | null;
	if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
	if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Supported video formats: MP4, MOV, WebM.' }, { status: 400 });
	if (file.size > MAX_BYTES) return NextResponse.json({ error: `Video must be under ${MAX_MB} MB.` }, { status: 400 });

	const buffer = Buffer.from(await file.arrayBuffer());
	const result = await uploadVideoFromBuffer(buffer, file.name);
	const now = new Date().toISOString();
	const asset = await getNativeContentStore().saveAsset({
		id: crypto.randomUUID(),
		ownerUserId: user.id,
		assetType: 'video',
		sourceType: 'upload',
		storageProvider: 'cloudinary',
		providerAssetId: result.public_id,
		url: result.secure_url,
		mimeType: file.type,
		width: result.width,
		height: result.height,
		aspectRatio: result.width && result.height ? `${result.width}:${result.height}` : undefined,
		fileSize: file.size,
		provenance: { path: 'brand_library_video' },
		approvalStatus: 'draft',
		createdAt: now,
		updatedAt: now,
	});

	return NextResponse.json({
		assetId: asset.id,
		secureUrl: result.secure_url,
		publicId: result.public_id,
		width: result.width,
		height: result.height,
	});
}
