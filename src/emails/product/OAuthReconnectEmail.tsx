import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text } from '@react-email/components';

export interface OAuthReconnectEmailProps {
	userName?: string;
	provider: 'linkedin' | 'buffer' | 'x' | 'facebook';
	reconnectUrl: string; // link to connection settings page
	affectedCount?: number;
}

export function OAuthReconnectEmail({
	userName,
	provider,
	reconnectUrl,
	affectedCount = 1,
}: OAuthReconnectEmailProps) {
	const providerName = provider === 'linkedin' ? 'LinkedIn' : provider.charAt(0).toUpperCase() + provider.slice(1);
	
	return (
		<EmailLayout preview="Action required. Reconnect your LinkedIn account to resume publishing">
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Action required. Reconnect your LinkedIn account to resume publishing</h1>
				<Text style={bodyStyle}>
					Hi {userName ? userName.split(' ')[0] : 'there'},
				</Text>
				<Text style={bodyStyle}>
					We were unable to publish {affectedCount === 1 ? 'one of your scheduled' : `${affectedCount} of your scheduled`} LinkedIn {affectedCount === 1 ? 'post' : 'posts'} because your LinkedIn connection has expired.
				</Text>
				<Text style={bodyStyle}>
					This happens occasionally when LinkedIn refreshes security permissions or when an account has not been reauthorised for a while. It is a normal LinkedIn requirement and nothing is wrong with your content or your account.
				</Text>
				<Text style={sectionHeadingStyle}>What this means</Text>
				<ul style={listStyle}>
					<li style={listItemStyle}>Publishing to LinkedIn is temporarily paused</li>
					<li style={listItemStyle}>{affectedCount} {affectedCount === 1 ? 'post is' : 'posts are'} currently queued and waiting</li>
					<li style={listItemStyle}>No content will be lost or skipped</li>
				</ul>
				<Text style={sectionHeadingStyle}>What to do next</Text>
				<Text style={bodyStyle}>
					Reconnecting your LinkedIn account takes less than a minute. Simply disconnect your profile, then reconnect it straightaway.
				</Text>
				<Text style={bodyStyle}>
					Once you reconnect, we will automatically retry publishing your pending posts without you needing to do anything else.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={reconnectUrl}>Reconnect LinkedIn</EmailButton>
				</div>
				<Text style={mutedStyle}>
					Thanks for taking care of this so we can keep your content publishing smoothly.
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
	margin: '0 0 20px 0',
};

const issueBoxStyle = {
	backgroundColor: '#1F2937',
	borderRadius: '8px',
	padding: '16px',
	margin: '20px 0',
	border: '1px solid #374151',
	borderLeft: '4px solid #F59E0B',
};

const issueTextStyle = {
	color: '#E5E7EB',
	fontSize: '14px',
	lineHeight: '20px',
	margin: '0',
};

const warningStyle = {
	color: '#F59E0B',
	fontSize: '14px',
	fontWeight: '600',
	margin: '20px 0',
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
	margin: '24px 0 0 0',
	textAlign: 'center' as const,
};

const sectionHeadingStyle = {
	color: '#FFFFFF',
	fontSize: '16px',
	fontWeight: '600',
	margin: '24px 0 12px 0',
	textAlign: 'left' as const,
};

const listStyle = {
	margin: '0 0 20px 0',
	paddingLeft: '20px',
};

const listItemStyle = {
	color: '#9CA3AF',
	fontSize: '15px',
	lineHeight: '22px',
	margin: '8px 0',
	textAlign: 'left' as const,
};


