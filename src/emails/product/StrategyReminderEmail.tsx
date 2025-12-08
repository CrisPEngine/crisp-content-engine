import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text, Link } from '@react-email/components';

export interface StrategyReminderEmailProps {
	userName: string;
	monthLabel: string; // e.g., "March 2026"
	strategyUrl: string; // link to strategy review page in app
	keepStrategyUrl: string; // one-click link to confirm "continue with existing strategy"
	updateStrategyUrl: string; // link to "start new strategy" flow
	deadlineLabel: string; // e.g., "by 27 March"
}

export function StrategyReminderEmail({
	userName,
	monthLabel,
	strategyUrl,
	keepStrategyUrl,
	updateStrategyUrl,
	deadlineLabel,
}: StrategyReminderEmailProps) {
	return (
		<EmailLayout preview={`Time to confirm your strategy for ${monthLabel}`}>
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Time to confirm your strategy for {monthLabel}</h1>
				<Text style={bodyStyle}>
					Hi {userName},
					<br />
					<br />
					Your current billing period is ending soon, and it's time to decide on your content strategy for next month.
					You can either submit a new strategy or continue with your existing one.
				</Text>
				<Text style={infoStyle}>
					<strong>What happens next:</strong>
					<br />
					• If you click "Continue with existing strategy", we'll use your current strategy for {monthLabel}.
					<br />
					• If you take no action by {deadlineLabel}, we'll automatically continue with your existing strategy.
					<br />
					• You can add comments or feedback on your strategy on the review page.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={strategyUrl}>Review or update strategy</EmailButton>
				</div>
				<div style={secondaryLinkStyle}>
					<Link href={keepStrategyUrl} style={linkStyle}>
						Continue with current strategy
					</Link>
				</div>
				<Text style={mutedStyle}>
					You can add comments on your strategy on the review page.
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


