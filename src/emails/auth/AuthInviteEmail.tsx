import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text } from '@react-email/components';

export interface AuthInviteEmailProps {
	inviteUrl: string;
	userEmail: string;
	trialDays?: number;
	plan?: string;
}

export function AuthInviteEmail({ inviteUrl, userEmail, trialDays, plan }: AuthInviteEmailProps) {
	const hasTrial = trialDays && trialDays > 0;
	
	return (
		<EmailLayout preview={hasTrial ? `You've been invited to try CRISP Content Engine - ${trialDays} day free trial!` : "You have been invited to CRISP Content Engine"}>
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>
					{hasTrial ? `You've been invited to try CRISP Content Engine` : 'You have been invited to CRISP Content Engine'}
				</h1>
				{hasTrial && (
					<div style={trialBadgeStyle}>
						<Text style={trialBadgeTextStyle}>
							🎉 {trialDays}-Day Free Trial
						</Text>
						{plan && (
							<Text style={planTextStyle}>
								{plan} Plan
							</Text>
						)}
					</div>
				)}
				<Text style={bodyStyle}>
					{hasTrial 
						? `You've been invited to try CRISP Content Engine with a ${trialDays}-day free trial. Click the button below to accept your invitation and start your free trial.`
						: `You've been invited to join CRISP Content Engine. Click the button below to accept your invitation and set up your account.`
					}
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={inviteUrl}>{hasTrial ? 'Start Free Trial' : 'Accept Invite'}</EmailButton>
				</div>
				<Text style={mutedStyle}>
					This invitation link will expire in 24 hours. If you did not expect this invitation, you can safely ignore this email.
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

const trialBadgeStyle = {
	backgroundColor: '#10B981',
	borderRadius: '8px',
	padding: '16px',
	margin: '0 0 24px 0',
	textAlign: 'center' as const,
};

const trialBadgeTextStyle = {
	color: '#FFFFFF',
	fontSize: '18px',
	fontWeight: '600',
	margin: '0 0 8px 0',
	textAlign: 'center' as const,
};

const planTextStyle = {
	color: '#D1FAE5',
	fontSize: '14px',
	margin: '0',
	textAlign: 'center' as const,
};


