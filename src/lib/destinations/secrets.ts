import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { DestinationCredentials } from './types';

function key(): Buffer {
	const raw = process.env.CMS_CREDENTIALS_ENCRYPTION_KEY || process.env.LINKEDIN_ENCRYPTION_KEY;
	if (!raw) throw new Error('No encryption key is configured for CMS credentials.');
	const buffer = Buffer.from(raw, raw.length === 64 ? 'hex' : 'base64');
	if (buffer.length !== 32) throw new Error('The CMS credential encryption key must decode to 32 bytes.');
	return buffer;
}

export function encryptCredentials(credentials: DestinationCredentials): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const data = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
	return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

export function decryptCredentials(payload: string): DestinationCredentials {
	const [version, ivB64, tagB64, dataB64] = payload.split('.');
	if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Stored CMS credentials are in an unknown format.');
	const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
	return JSON.parse(plain) as DestinationCredentials;
}
