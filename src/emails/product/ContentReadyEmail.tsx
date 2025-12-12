/**
 * Content Ready Email
 * 
 * Sent when content generation is completed after a content brief is approved
 */

import { EmailLayout } from '../components/Layout';
import { EmailButton } from '../components/Button';
import { EmailHeader } from '../components/Header';
import { Text } from '@react-email/components';

export interface ContentReadyEmailProps {
	userName: string;
	contentUrl: string;
	brandName?: string;
}

const headingStyle: React.CSSProperties = {
	fontSize: '24px',
	fontWeight: '600',
	color: '#ffffff',
	marginBottom: '16px',
	lineHeight: '1.3',
};

const bodyStyle: React.CSSProperties = {
	color: '#a0a0a0',
	marginBottom: '16px',
	lineHeight: '1.6',
	fontSize: '16px',
};

const contentStyle: React.CSSProperties = {
	padding: '24px',
};

const buttonContainerStyle: React.CSSProperties = {
	marginTop: '24px',
	marginBottom: '24px',
};

export function ContentReadyEmail({
	userName,
	contentUrl,
	brandName,
}: ContentReadyEmailProps) {
	return (
		<EmailLayout preview="New content ready for approval">
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>New content ready for approval</h1>
				<Text style={bodyStyle}>
					Hi {userName},
					<br />
					<br />
					{brandName ? `New content has been generated for ${brandName}` : 'New content has been generated'} and is ready for your review.
				</Text>
				<Text style={bodyStyle}>
					Please review and approve the content before it's scheduled for publishing.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={contentUrl}>Review Content</EmailButton>
				</div>
				<Text style={{ ...bodyStyle, fontSize: '14px', color: '#666666', marginTop: '24px' }}>
					This content was generated based on your approved monthly content brief.
				</Text>
			</div>
		</EmailLayout>
	);
}
