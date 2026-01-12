import { EmailLayout } from '../components/Layout';
import { EmailHeader } from '../components/Header';
import { EmailFooter } from '../components/Footer';
import { EmailButton } from '../components/Button';
import { Text } from '@react-email/components';

export interface TrialEndingEmailProps {
	upgradeUrl: string;
	userEmail: string;
	trialEndsDate: string;
	isTrialEnded?: boolean; // If true, trial has ended; if false/undefined, trial is ending soon
}

export function TrialEndingEmail({ upgradeUrl, userEmail, trialEndsDate, isTrialEnded = false }: TrialEndingEmailProps) {
	return (
		<EmailLayout preview={isTrialEnded ? "Your free trial has ended" : "Your content pipeline doesn't have to stop here"}>
			<EmailHeader />
			<div style={contentStyle}>
				<h1 style={headingStyle}>Your content pipeline doesn't have to stop here</h1>
				<Text style={bodyStyle}>
					{isTrialEnded ? "Your free trial has ended." : "Your free trial is almost over."}
				</Text>
				<Text style={bodyStyle}>
					If you want to keep generating content and automatically posting without interruption, now is the moment to move to a paid plan.
				</Text>
				<Text style={sectionHeadingStyle}>Here's what you unlock when you upgrade.</Text>
				<div style={benefitsListStyle}>
					<Text style={benefitItemStyle}>
						<strong>More control over your content</strong><br />
						Paid plans let you submit more detailed briefs for the upcoming month. That means clearer topics, sharper angles and content that actually reflects your brand voice instead of generic output.
					</Text>
					<Text style={benefitItemStyle}>
						<strong>End to end automation</strong><br />
						Generate, schedule and auto publish content in one workflow. No copying. No reminders. No missed posting windows.
					</Text>
					<Text style={benefitItemStyle}>
						<strong>Consistency without effort</strong><br />
						Content Engine builds a structured pipeline so your brand shows up regularly, not in bursts when you find time.
					</Text>
					<Text style={benefitItemStyle}>
						<strong>Strategy first, AI second</strong><br />
						You stay in control. You define the brief, positioning and intent. The engine handles execution at speed.
					</Text>
				</div>
				<Text style={bodyStyle}>
					If content is part of your growth plan, stopping now means going back to manual work and broken consistency.
				</Text>
				<Text style={bodyStyle}>
					Upgrade today to keep your content running and plan next month properly.
				</Text>
				<div style={buttonContainerStyle}>
					<EmailButton href={upgradeUrl}>Upgrade your plan</EmailButton>
				</div>
				<Text style={taglineStyle}>
					Free trials end. Momentum doesn't have to.
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
	margin: '0 0 16px 0',
	textAlign: 'left' as const,
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

const buttonContainerStyle = {
	textAlign: 'center' as const,
	margin: '28px 0',
};

const taglineStyle = {
	color: '#6B7280',
	fontSize: '13px',
	lineHeight: '20px',
	margin: '32px 0 0 0',
	textAlign: 'center' as const,
	fontStyle: 'italic' as const,
};
