import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // GCM recommended IV size

function getKey() {
	const raw = process.env.LINKEDIN_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error('Missing LINKEDIN_ENCRYPTION_KEY environment variable');
	}
	const buffer = Buffer.from(raw, raw.length === KEY_LENGTH * 2 ? 'hex' : 'base64');
	if (buffer.length !== KEY_LENGTH) {
		throw new Error('LINKEDIN_ENCRYPTION_KEY must decode to 32 bytes (AES-256 key)');
	}
	return buffer;
}

export function encryptToken(plainText: string) {
	const key = getKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptToken(payload: string | null | undefined) {
	if (!payload) return null;
	const key = getKey();
	const [ivB64, tagB64, dataB64] = payload.split('.');
	if (!ivB64 || !tagB64 || !dataB64) {
		throw new Error('Invalid encrypted payload format');
	}
	const iv = Buffer.from(ivB64, 'base64');
	const authTag = Buffer.from(tagB64, 'base64');
	const data = Buffer.from(dataB64, 'base64');
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);
	const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
	return decrypted.toString('utf8');
}
