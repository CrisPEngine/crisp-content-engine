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
		<EmailLayout preview={hasTrial ? "Finish setting up. Your free trial is ready" : "You have been invited to CRISP Content Engine"}>
			<EmailHeader />
			<div style={contentStyle}>
				{hasTrial ? (
					<>
						<h1 style={headingStyle}>Finish setting up. Your free trial is ready</h1>
						<Text style={bodyStyle}>
							You've already completed the first step by submitting your authorisation.
						</Text>
						<Text style={bodyStyle}>
							The next step is simple, activate your free trial and start generating content immediately.
						</Text>
						<Text style={sectionHeadingStyle}>Here's what you get during the trial.</Text>
						<div style={benefitsListStyle}>
							<Text style={benefitItemStyle}>
								<strong>Structured content generation</strong><br />
								Submit briefs and receive ready to use posts aligned to your brand and objectives.
							</Text>
							<Text style={benefitItemStyle}>
								<strong>Automated scheduling</strong><br />
								Plan and schedule content in advance so posting happens consistently without manual work.
							</Text>
							<Text style={benefitItemStyle}>
								<strong>One workflow, no tools to juggle</strong><br />
								Brief, generate, review and publish from a single place.
							</Text>
						</div>
						<Text style={bodyStyle}>
							There's no obligation and no payment required to start the trial. It's simply a chance to see how Content Engine fits into your workflow.
						</Text>
						<Text style={bodyStyle}>
							Activate your free trial now and put the authorisation you've already completed to work.
						</Text>
						<Text style={bodyStyle}>
							<strong>You don't have a password yet.</strong> When you click the button, you'll be taken to a page where you can set your password. Use this password to sign in in the future.
						</Text>
						<div style={buttonContainerStyle}>
							<EmailButton href={inviteUrl}>Set password & start free trial</EmailButton>
						</div>
						<Text style={mutedStyle}>
							This invitation link will expire in 24 hours. If you did not expect this invitation, you can safely ignore this email.
						</Text>
					</>
				) : (
					<>
						<h1 style={headingStyle}>You have been invited to CRISP Content Engine</h1>
						<Text style={bodyStyle}>
							You've been invited to join CRISP Content Engine. Click the button below to accept your invitation and set up your account.
						</Text>
						<Text style={bodyStyle}>
							<strong>You don't have a password yet.</strong> When you click the button, you'll be taken to a page where you can set your password. Use this password to sign in in the future.
						</Text>
						<div style={buttonContainerStyle}>
							<EmailButton href={inviteUrl}>Set password & accept invite</EmailButton>
						</div>
						<Text style={mutedStyle}>
							This invitation link will expire in 24 hours. If you did not expect this invitation, you can safely ignore this email.
						</Text>
					</>
				)}
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

const sectionHeadingStyle = {
	color: '#FFFFFF',
	fontSize: '16px',
	fontWeight: '600',
	margin: '24px 0 16px 0',
	textAlign: 'left' as const,
};

const benefitsListStyle = {
	margin: '16px 0 24px 0',
};

const benefitItemStyle = {
	color: '#9CA3AF',
	fontSize: '14px',
	lineHeight: '20px',
	margin: '0 0 16px 0',
	textAlign: 'left' as const,
};


