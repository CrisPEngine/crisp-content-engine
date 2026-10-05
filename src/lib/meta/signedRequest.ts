import crypto from 'crypto';

export type SignedRequestPayload = {
	user_id?: string;
	algorithm?: string;
	issued_at?: number;
	[key: string]: unknown;
};

export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequestPayload | null {
	const [encodedSig, payload] = signedRequest.split('.');
	if (!encodedSig || !payload) return null;

	const expectedSig = crypto
		.createHmac('sha256', appSecret)
		.update(payload)
		.digest('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');

	const providedSig = encodedSig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	if (expectedSig !== providedSig) return null;

	try {
		return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8')) as SignedRequestPayload;
	} catch {
		return null;
	}
}
