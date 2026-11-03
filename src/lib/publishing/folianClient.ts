const ALLOWED_IMAGE_HOSTS = new Set(['res.cloudinary.com']);
const MAX_BYTES = 8 * 1024 * 1024;

export function folianBaseUrl(): string | null {
	const raw = process.env.FOLIAN_CONTENT_API_URL?.trim();
	return raw ? raw.replace(/\/$/, '') : null;
}

export function folianHeaders(json = false): Record<string, string> | null {
	const key = process.env.FOLIAN_CONTENT_API_KEY?.trim();
	if (!key) return null;
	const bypass = process.env.FOLIAN_VERCEL_PROTECTION_BYPASS?.trim();
	return {
		Authorization: `Bearer ${key}`,
		...(json ? { 'Content-Type': 'application/json' } : {}),
		...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
	};
}

export function isAllowedImageUrl(raw: string): boolean {
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(url.hostname);
	} catch {
		return false;
	}
}

export async function uploadImageToFolian(input: {
	bytes: Buffer;
	filename: string;
	mimeType: string;
	alt: string;
	credit: string;
	license: string;
	caption?: string;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
	const base = folianBaseUrl();
	const headers = folianHeaders();
	if (!base || !headers) {
		return { ok: false, error: 'FOLIAN_CONTENT_API_URL or FOLIAN_CONTENT_API_KEY is not configured' };
	}
	if (input.bytes.length > MAX_BYTES) return { ok: false, error: 'Image exceeds 8 MB.' };
	const form = new FormData();
	form.set('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.filename);
	form.set('alt', input.alt);
	form.set('credit', input.credit);
	form.set('license', input.license);
	if (input.caption) form.set('caption', input.caption);
	const response = await fetch(`${base}/api/content/v1/media`, { method: 'POST', headers, body: form });
	const payload = (await response.json().catch(() => ({}))) as { mediaId?: string; message?: string; code?: string };
	if (!response.ok || !payload.mediaId) {
		return { ok: false, error: String(payload.message ?? payload.code ?? `Folian media ${response.status}`) };
	}
	return { ok: true, mediaId: String(payload.mediaId) };
}

export async function fetchAllowedImage(url: string): Promise<{ ok: true; bytes: Buffer; mimeType: string } | { ok: false; error: string }> {
	if (!isAllowedImageUrl(url)) return { ok: false, error: 'Image URL host is not allowed.' };
	const response = await fetch(url);
	if (!response.ok) return { ok: false, error: `Image fetch failed (${response.status}).` };
	const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
		return { ok: false, error: 'Unsupported image type.' };
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.length > MAX_BYTES) return { ok: false, error: 'Image exceeds 8 MB.' };
	return { ok: true, bytes, mimeType };
}
