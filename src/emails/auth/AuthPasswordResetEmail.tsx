import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text } from '@react-email/components';

export interface AuthPasswordResetEmailProps {
	resetUrl: string;
	userEmail: string;
}

export function AuthPasswordResetEmail({ resetUrl, userEmail }: AuthPasswordResetEmailProps) {
	return (
		<EmailLayout preview="Reset your CrisP Content Engine password">
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Reset your password</h1>
				<Text style={bodyStyle}>
					We received a request to reset your CrisP Content Engine password.
					<br />
					Click the button below to securely set a new password.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={resetUrl}>Reset Password</EmailButton>
				</div>
				<Text style={mutedStyle}>
					If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
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


