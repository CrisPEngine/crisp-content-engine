import crypto from 'crypto';

const SECRET = process.env.EMAIL_ACTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret-change-in-production';
const TOKEN_EXPIRY_HOURS = 24; // Tokens expire after 24 hours

export interface EmailActionToken {
	userId: string;
	action: string;
	resourceId: string;
	expiresAt: number;
}

/**
 * Generate a signed token for email actions
 */
export function signEmailActionToken(data: {
	userId: string;
	action: string;
	resourceId: string;
}): string {
	const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
	const payload: EmailActionToken = {
		...data,
		expiresAt,
	};

	const payloadString = JSON.stringify(payload);
	const hmac = crypto.createHmac('sha256', SECRET);
	hmac.update(payloadString);
	const signature = hmac.digest('hex');

	// Encode payload and signature as base64 URL-safe string
	const token = Buffer.from(`${payloadString}:${signature}`).toString('base64url');
	return token;
}

/**
 * Verify and decode an email action token
 */
export function verifyEmailActionToken(token: string): EmailActionToken | null {
	try {
		const decoded = Buffer.from(token, 'base64url').toString('utf-8');
		const [payloadString, signature] = decoded.split(':');

		if (!payloadString || !signature) {
			return null;
		}

		// Verify signature
		const hmac = crypto.createHmac('sha256', SECRET);
		hmac.update(payloadString);
		const expectedSignature = hmac.digest('hex');

		if (signature !== expectedSignature) {
			return null;
		}

		const payload: EmailActionToken = JSON.parse(payloadString);

		// Check expiration
		if (Date.now() > payload.expiresAt) {
			return null;
		}

		return payload;
	} catch (error) {
		console.error('Error verifying email action token:', error);
		return null;
	}
}

/**
 * Generate a signed URL for email actions
 */
export function generateEmailActionUrl({
	baseUrl,
	userId,
	action,
	resourceId,
}: {
	baseUrl: string;
	userId: string;
	action: string;
	resourceId: string;
}): string {
	const token = signEmailActionToken({ userId, action, resourceId });
	const params = new URLSearchParams({
		userId,
		resourceId: resourceId,
		token,
	});
	// Action format: "strategy/keep" or "content/approve"
	return `${baseUrl}/api/email-actions/${action}?${params.toString()}`;
}

