import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text } from '@react-email/components';

export interface OAuthReconnectEmailProps {
	userName: string;
	provider: 'linkedin' | 'buffer' | 'x' | 'facebook';
	issueSummary: string; // "We could not publish 3 LinkedIn posts because your LinkedIn connection has expired."
	reconnectUrl: string; // link to connection settings page
	affectedCount?: number;
	firstFailedAt?: string;
}

export function OAuthReconnectEmail({
	userName,
	provider,
	issueSummary,
	reconnectUrl,
	affectedCount,
	firstFailedAt,
}: OAuthReconnectEmailProps) {
	const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
	
	return (
		<EmailLayout preview={`Action needed: Reconnect your ${providerName} account`}>
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Action needed: Reconnect your {providerName} account</h1>
				<Text style={bodyStyle}>
					Hi {userName},
					<br />
					<br />
					We tried to publish your content, but your {providerName} connection has expired or failed.
				</Text>
				<div style={issueBoxStyle}>
					<Text style={issueTextStyle}>
						{issueSummary}
						{affectedCount && affectedCount > 0 && (
							<>
								<br />
								<br />
								<strong>{affectedCount} post{affectedCount !== 1 ? 's' : ''} {affectedCount === 1 ? 'is' : 'are'} waiting to be published.</strong>
							</>
						)}
						{firstFailedAt && (
							<>
								<br />
								<br />
								First failed: {firstFailedAt}
							</>
						)}
					</Text>
				</div>
				<Text style={warningStyle}>
					⚠️ Publishing is paused until you reconnect your {providerName} account.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={reconnectUrl}>Reconnect {providerName}</EmailButton>
				</div>
				<Text style={mutedStyle}>
					Once you reconnect, we'll automatically retry publishing your pending posts.
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


