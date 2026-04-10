'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, CheckCircle, Lightbulb, Users, Calendar } from 'lucide-react';
import { useUsage } from '@/lib/useUsage';

type Props = {
	currentStep: number;
	hasContentToReview: boolean;
	hasBrandProfiles: boolean;
	hasApprovedStrategies: boolean;
	hasSubscription: boolean;
	brandProfileId?: string;
};

type NextStep = {
	label: string;
	message: string;
	href: string;
	icon: React.ReactNode;
	variant: 'primary' | 'accent' | 'warning';
};

function computeStep(
	currentStep: number,
	hasContentToReview: boolean,
	hasBrandProfiles: boolean,
	hasApprovedStrategies: boolean,
	hasSubscription: boolean,
	brandProfileId: string | undefined,
	quotaExhausted: boolean,
): NextStep {
	if (!hasSubscription) {
		return {
			label: 'Get started',
			message: 'Select a plan to unlock AI-powered content generation, scheduling and publishing.',
			href: '/billing',
			icon: <Sparkles className="w-5 h-5" />,
			variant: 'primary',
		};
	}
	if (currentStep === 1 || !hasBrandProfiles) {
		return {
			label: 'Create your brand profile',
			message: 'Complete your brand questionnaire so CRISP can build your personalised content strategy.',
			href: '/onboarding',
			icon: <Users className="w-5 h-5" />,
			variant: 'primary',
		};
	}
	if (currentStep === 2) {
		return {
			label: 'Review your strategy',
			message: 'Your content strategy is ready. Review and approve it to unlock content generation.',
			href: brandProfileId ? `/strategy/${brandProfileId}` : '/strategy',
			icon: <CheckCircle className="w-5 h-5" />,
			variant: 'primary',
		};
	}
	if (currentStep === 3) {
		return {
			label: 'Start your first content series',
			message: 'Your strategy is approved. Use Idea Engine to turn one idea into a full week of channel-ready content.',
			href: '/content/idea-engine',
			icon: <Lightbulb className="w-5 h-5" />,
			variant: 'accent',
		};
	}
	if (currentStep === 4) {
		return {
			label: 'Connect your social accounts',
			message: 'Connect LinkedIn, Facebook or Instagram to enable direct publishing from CRISP.',
			href: '/connections',
			icon: <ArrowRight className="w-5 h-5" />,
			variant: 'primary',
		};
	}
	if (currentStep === 5 || hasContentToReview) {
		return {
			label: 'Review your latest drafts',
			message: 'You have content waiting for your review. Approve, edit or schedule your posts.',
			href: '/content/approval',
			icon: <CheckCircle className="w-5 h-5" />,
			variant: 'primary',
		};
	}
	// Active user (currentStep === 0)
	if (quotaExhausted) {
		return {
			label: 'Upgrade to continue generating',
			message: "You've reached your monthly content limit. Upgrade your plan to keep creating.",
			href: '/billing',
			icon: <Calendar className="w-5 h-5" />,
			variant: 'warning',
		};
	}
	return {
		label: 'Create your next content batch',
		message: 'Turn one idea into a full content system across LinkedIn, X, Blog and more.',
		href: '/content/idea-engine',
		icon: <Lightbulb className="w-5 h-5" />,
		variant: 'accent',
	};
}

const VARIANT_STYLES = {
	primary: 'bg-primary/10 border-primary/30 text-primary',
	accent:  'bg-accent/10 border-accent/30 text-accent',
	warning: 'bg-warning/10 border-warning/30 text-warning',
};

const BUTTON_STYLES = {
	primary: 'bg-primary hover:bg-primary/90 text-white',
	accent:  'bg-accent hover:bg-accent/90 text-white',
	warning: 'bg-warning hover:bg-warning/90 text-white',
};

export function RecommendedNextStep(props: Props) {
	const { data: usageData } = useUsage();

	const postsCap = usageData?.caps?.posts_per_month;
	const isUnlimited = !postsCap || postsCap >= 999999;
	const usedPosts = usageData?.usage?.posts || 0;
	const quotaExhausted = !isUnlimited && postsCap != null && usedPosts >= postsCap;

	const step = computeStep(
		props.currentStep,
		props.hasContentToReview,
		props.hasBrandProfiles,
		props.hasApprovedStrategies,
		props.hasSubscription,
		props.brandProfileId,
		quotaExhausted,
	);

	return (
		<div className={`card p-4 md:p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${VARIANT_STYLES[step.variant]}`}>
			<div className="flex items-start gap-3 flex-1 min-w-0">
				<div className="shrink-0 mt-0.5 opacity-80">{step.icon}</div>
				<div className="min-w-0">
					<p className="text-[11px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">Recommended next step</p>
					<p className="font-semibold text-sm md:text-base leading-snug">{step.label}</p>
					<p className="text-xs md:text-sm opacity-70 mt-0.5 leading-relaxed">{step.message}</p>
				</div>
			</div>
			<Link
				href={step.href}
				className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl2 font-semibold text-sm transition-colors ${BUTTON_STYLES[step.variant]}`}
			>
				{step.label}
				<ArrowRight className="w-4 h-4" />
			</Link>
		</div>
	);
}
