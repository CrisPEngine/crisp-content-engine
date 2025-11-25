'use client';

import { useEffect } from 'react';

interface OnboardingDebugProps {
	isLinkedInConnected: boolean;
	hasBrandProfiles: boolean;
	hasStrategyReady: boolean;
	hasApprovedStrategies: boolean;
	hasContentToReview: boolean;
	brandProfiles: any[];
	currentStep: number;
}

export function OnboardingDebug({
	isLinkedInConnected,
	hasBrandProfiles,
	hasStrategyReady,
	hasApprovedStrategies,
	hasContentToReview,
	brandProfiles,
	currentStep,
}: OnboardingDebugProps) {
	useEffect(() => {
		console.log('=== Onboarding Step Detection Debug ===');
		console.log('isLinkedInConnected:', isLinkedInConnected);
		console.log('hasBrandProfiles:', hasBrandProfiles);
		console.log('hasStrategyReady:', hasStrategyReady);
		console.log('hasApprovedStrategies:', hasApprovedStrategies);
		console.log('hasContentToReview:', hasContentToReview);
		console.log('currentStep:', currentStep);
		console.log('Brand Profiles:', brandProfiles.map((p: any) => ({
			name: p.client_name,
			status: p.status,
			original_status: p.original_status,
			strategy_summary: p.strategy_summary ? 'exists' : 'missing',
		})));
		console.log('========================================');
	}, [isLinkedInConnected, hasBrandProfiles, hasStrategyReady, hasApprovedStrategies, hasContentToReview, brandProfiles, currentStep]);

	return null; // This component doesn't render anything
}

