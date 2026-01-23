import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text, Link } from '@react-email/components';

export interface PreviewPackEmailProps {
	previewPackUrl: string;
	appHomeUrl: string;
	firstName?: string;
}

export function PreviewPackEmail({
	previewPackUrl,
	appHomeUrl,
	firstName,
}: PreviewPackEmailProps) {
	return (
		<EmailLayout preview="Your generated posts. No login required.">
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Your content pack is ready</h1>
				<Text style={bodyStyle}>
					{firstName ? `Hi ${firstName},` : 'Hi,'}
				</Text>
				<Text style={bodyStyle}>
					Here is your generated content preview from CRISP Content Engine.
				</Text>
				<Text style={bodyStyle}>
					This is a quick preview pack showing what the engine can produce based on the inputs you selected. It is designed to give you something immediately useful, without setup or onboarding.
				</Text>
				<Text style={bodyStyle}>
					You can view and copy all posts here:
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={previewPackUrl}>View your content pack</EmailButton>
				</div>
				<Text style={bodyStyle}>
					No account required. You can bookmark this link and come back anytime.
				</Text>
				<Text style={sectionHeadingStyle}>What you are seeing:</Text>
				<ul style={listStyle}>
					<li style={listItemStyle}>Fully written posts based on your persona, topics, tone and goal</li>
					<li style={listItemStyle}>Structured so you can copy and post immediately</li>
					<li style={listItemStyle}>One pack. No strategy setup yet.</li>
				</ul>
				<Text style={sectionHeadingStyle}>What this preview does not include:</Text>
				<ul style={listStyle}>
					<li style={listItemStyle}>Brand strategy</li>
					<li style={listItemStyle}>Voice memory</li>
					<li style={listItemStyle}>Approval workflows</li>
					<li style={listItemStyle}>Scheduling or publishing</li>
					<li style={listItemStyle}>Ongoing content systems</li>
				</ul>
				<Text style={bodyStyle}>
					Those come with the full engine.
				</Text>
				<Text style={sectionHeadingStyle}>If you want to turn this into a system that:</Text>
				<ul style={listStyle}>
					<li style={listItemStyle}>Remembers how you write</li>
					<li style={listItemStyle}>Builds strategy once and compounds over time</li>
					<li style={listItemStyle}>Saves everything to a workspace</li>
					<li style={listItemStyle}>Supports review and approvals</li>
				</ul>
				<Text style={bodyStyle}>
					You can explore the full engine here:
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={appHomeUrl} variant="secondary">Explore CRISP Content Engine</EmailButton>
				</div>
				<Text style={mutedStyle}>
					If you did not request this preview, you can safely ignore this email.
				</Text>
				<Text style={mutedStyle}>
					<strong>CRISP Content Engine</strong>
					<br />
					Build content systems, not posts
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
