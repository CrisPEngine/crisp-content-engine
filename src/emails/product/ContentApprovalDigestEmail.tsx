import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { EmailCard } from '../components/Card';
import { Text, Link } from '@react-email/components';

export interface ContentApprovalItem {
	id: string;
	platform: string;
	title: string;
	shortPreview: string; // truncated body
	scheduledTime?: string; // human formatted
	viewUrl: string; // link into app for full review
	approveUrl: string; // one-click approve link
}

export interface ContentApprovalDigestEmailProps {
	userName: string;
	pendingCount: number;
	items: ContentApprovalItem[];
	dashboardUrl: string;
	approveAllUrl?: string; // Optional: link to approve all pending content
}

export function ContentApprovalDigestEmail({
	userName,
	pendingCount,
	items,
	dashboardUrl,
	approveAllUrl,
}: ContentApprovalDigestEmailProps) {
	return (
		<EmailLayout preview={`You have ${pendingCount} post${pendingCount !== 1 ? 's' : ''} waiting for approval`}>
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>
					You have {pendingCount} post{pendingCount !== 1 ? 's' : ''} waiting for approval
				</h1>
				<Text style={bodyStyle}>
					Hi {userName},
					<br />
					<br />
					Your content is ready for review. Please review and approve the posts below.
				</Text>
				{approveAllUrl && (
					<div style={approveAllButtonContainerStyle}>
						<EmailButton href={approveAllUrl}>Approve all pending posts</EmailButton>
					</div>
				)}
				{items.map((item) => (
					<EmailCard key={item.id}>
						<div style={itemHeaderStyle}>
							<Text style={platformStyle}>{item.platform}</Text>
							<Text style={titleStyle}>{item.title}</Text>
						</div>
						<Text style={previewStyle}>{item.shortPreview}</Text>
						{item.scheduledTime && (
							<Text style={scheduledStyle}>Scheduled: {item.scheduledTime}</Text>
						)}
						<div style={itemActionsStyle}>
							<Link href={item.viewUrl} style={linkStyle}>
								Review in app →
							</Link>
							<Link href={item.approveUrl} style={approveLinkStyle}>
								✓ Approve this post
							</Link>
						</div>
					</EmailCard>
				))}
				<div style={buttonContainerStyle}>
					<Link href={dashboardUrl} style={linkStyle}>
						View all in dashboard →
					</Link>
				</div>
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
	margin: '0 0 24px 0',
};

const itemHeaderStyle = {
	marginBottom: '12px',
};

const platformStyle = {
	color: '#39FF14',
	fontSize: '12px',
	fontWeight: '600',
	textTransform: 'uppercase' as const,
	margin: '0 0 4px 0',
};

const titleStyle = {
	color: '#FFFFFF',
	fontSize: '16px',
	fontWeight: '600',
	margin: '0 0 8px 0',
};

const previewStyle = {
	color: '#9CA3AF',
	fontSize: '14px',
	lineHeight: '20px',
	margin: '0 0 8px 0',
};

const scheduledStyle = {
	color: '#6B7280',
	fontSize: '12px',
	margin: '0 0 12px 0',
};

const itemActionsStyle = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	marginTop: '12px',
	paddingTop: '12px',
	borderTop: '1px solid #374151',
};

const linkStyle = {
	color: '#39FF14',
	textDecoration: 'underline',
	fontSize: '14px',
};

const approveLinkStyle = {
	color: '#39FF14',
	textDecoration: 'underline',
	fontSize: '14px',
	fontWeight: '600',
};

const approveAllButtonContainerStyle = {
	textAlign: 'center' as const,
	margin: '0 0 28px 0',
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

