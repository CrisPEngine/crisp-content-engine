import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { EmailCard } from '../components/Card';
import { Text, Link } from '@react-email/components';

export interface ContentBatchItem {
	id: string;
	platform: string;
	title: string;
	shortPreview: string;
}

export interface ContentBatchReadyEmailProps {
	userName: string;
	brandName: string;
	itemCount: number;
	items: ContentBatchItem[]; // 3-5 sample posts
	platforms: string[]; // Unique platforms covered
	periodLabel: string; // e.g., "Next 30 days"
	dashboardUrl: string;
	approveAllUrl?: string; // Optional: link to approve all content
}

export function ContentBatchReadyEmail({
	userName,
	brandName,
	itemCount,
	items,
	platforms,
	periodLabel,
	dashboardUrl,
	approveAllUrl,
}: ContentBatchReadyEmailProps) {
	return (
		<EmailLayout preview={`Your new content batch for ${brandName} is ready for review`}>
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Your new content batch is ready for review</h1>
				<Text style={bodyStyle}>
					Hi {userName},
					<br />
					<br />
					We've created {itemCount} new post{itemCount !== 1 ? 's' : ''} for <strong>{brandName}</strong> covering {periodLabel}.
				</Text>
				<Text style={infoStyle}>
					<strong>Platforms:</strong> {platforms.join(', ')}
					<br />
					{items.length < itemCount && (
						<>
							<br />
							<strong>Preview:</strong> Showing {items.length} of {itemCount} posts below. View all in your dashboard.
						</>
					)}
				</Text>
				{items.length > 0 && (
					<div style={previewSectionStyle}>
						<Text style={previewHeadingStyle}>At a glance:</Text>
						{items.map((item) => (
							<EmailCard key={item.id}>
								<div style={itemHeaderStyle}>
									<Text style={platformStyle}>{item.platform}</Text>
									<Text style={titleStyle}>{item.title}</Text>
								</div>
								<Text style={previewStyle}>{item.shortPreview}</Text>
							</EmailCard>
						))}
					</div>
				)}
				<div style={buttonContainerStyle}>
					<EmailButton href={dashboardUrl}>Review and approve content</EmailButton>
				</div>
				{approveAllUrl && (
					<div style={secondaryLinkStyle}>
						<Link href={approveAllUrl} style={linkStyle}>
							Approve all posts
						</Link>
					</div>
				)}
				<Text style={mutedStyle}>
					Content is waiting for your approval in the dashboard. Once approved, posts will be published according to your schedule.
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

const infoStyle = {
	color: '#9CA3AF',
	fontSize: '14px',
	lineHeight: '20px',
	margin: '20px 0',
	backgroundColor: '#1F2937',
	padding: '16px',
	borderRadius: '8px',
	border: '1px solid #374151',
};

const previewSectionStyle = {
	margin: '24px 0',
};

const previewHeadingStyle = {
	color: '#FFFFFF',
	fontSize: '16px',
	fontWeight: '600',
	margin: '0 0 12px 0',
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
	margin: '0',
};

const buttonContainerStyle = {
	textAlign: 'center' as const,
	margin: '28px 0',
};

const secondaryLinkStyle = {
	textAlign: 'center' as const,
	margin: '16px 0',
};

const linkStyle = {
	color: '#39FF14',
	textDecoration: 'underline',
	fontSize: '14px',
};

const mutedStyle = {
	color: '#6B7280',
	fontSize: '13px',
	lineHeight: '20px',
	margin: '24px 0 0 0',
	textAlign: 'center' as const,
};


