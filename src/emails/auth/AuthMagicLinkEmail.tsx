import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text } from '@react-email/components';

export interface AuthMagicLinkEmailProps {
	magicLinkUrl: string;
	userEmail: string;
}

export function AuthMagicLinkEmail({ magicLinkUrl, userEmail }: AuthMagicLinkEmailProps) {
	return (
		<EmailLayout preview="Sign in to CRISP Content Engine">
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Sign in to CRISP Content Engine</h1>
				<Text style={bodyStyle}>
					Click the button below to sign in securely with a magic link.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={magicLinkUrl}>Sign in</EmailButton>
				</div>
				<Text style={mutedStyle}>
					This link will expire in 1 hour. If you did not request this sign-in link, you can safely ignore this email.
				</Text>
			</div>
			<EmailFooter />
		</EmailLayout>
	);
}

const contentStyle = {
	padding: '0 24px 24px 24px',
};

const headingStyle = {
	fontSize: '22px',
	color: '#FFFFFF',
	fontWeight: '600',
	margin: '0 0 16px 0',
	textAlign: 'center' as const,
};

const bodyStyle = {
	color: '#9CA3AF',
	fontSize: '15px',
	lineHeight: '22px',
	margin: '0 0 28px 0',
	textAlign: 'center' as const,
};

const buttonContainerStyle = {
	textAlign: 'center' as const,
	margin: '28px 0',
};

const mutedStyle = {
	color: '#6B7280',
	fontSize: '13px',
	lineHeight: '20px',
	margin: '32px 0 0 0',
	textAlign: 'center' as const,
};


