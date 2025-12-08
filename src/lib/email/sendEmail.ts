import { resend } from './resendClient';
import { ReactElement } from 'react';

export type SendEmailArgs = {
	to: string;
	subject: string;
	react: ReactElement;
	category?: 'auth' | 'strategy' | 'content' | 'system';
	replyTo?: string;
};

export async function sendEmail({ to, subject, react, category, replyTo }: SendEmailArgs) {
	const fromName = process.env.EMAIL_FROM_NAME ?? 'CRISP Content Engine';
	const fromEmail = process.env.EMAIL_FROM;
	
	if (!fromEmail) {
		throw new Error('EMAIL_FROM environment variable is not set');
	}

	const headers: Record<string, string> = {};
	if (category) {
		headers['X-CRISP-Category'] = category;
	}

	return resend.emails.send({
		from: `${fromName} <${fromEmail}>`,
		to,
		subject,
		react,
		replyTo: replyTo || process.env.EMAIL_REPLY_TO || undefined,
		headers: Object.keys(headers).length > 0 ? headers : undefined,
	});
}


