import type { AssetVisionAnalysis } from './assetVisionTypes';

export type ImageQualitySeverity = 'blocking' | 'major' | 'minor';

export type ImageQualityFinding = {
	code: string;
	severity: ImageQualitySeverity;
	message: string;
	advisory: true;
};

/** Heuristic / vision-assisted checks. Advisory only — not presented as infallible. */
export function assessGeneratedImageQuality(input: {
	vision?: AssetVisionAnalysis | null;
	visionStatus?: string | null;
	concept?: string | null;
	prompt?: string | null;
	hasProductReference?: boolean;
}): ImageQualityFinding[] {
	const findings: ImageQualityFinding[] = [];
	const vision = input.vision;
	if (!vision) {
		if (input.visionStatus === 'failed' || input.visionStatus === 'skipped') {
			findings.push({
				code: 'vision_unavailable',
				severity: 'major',
				message: 'Automated visual analysis was unavailable. Review the image manually before accepting it.',
				advisory: true,
			});
		}
		return findings;
	}

	const summary = `${vision.summary} ${vision.subjects.join(' ')} ${vision.detectedText.join(' ')}`.toLowerCase();
	if (/extra (arm|hand|finger|limb)|malformed|distorted hand|too many fingers|anatom/.test(summary)) {
		findings.push({
			code: 'anatomy_concern',
			severity: 'blocking',
			message: 'Vision analysis flagged a possible anatomical inconsistency. Prefer regenerating or rejecting this candidate.',
			advisory: true,
		});
	}
	if (/duplicate|duplicated object|two (laptops|screens) overlapping/.test(summary)) {
		findings.push({
			code: 'object_duplication',
			severity: 'major',
			message: 'Possible duplicated objects were described in the image analysis.',
			advisory: true,
		});
	}
	if (input.hasProductReference) {
		const inventedUi = /invented ui|fabricated interface|made-up (buttons|menus)|unreadable ui|gibberish/.test(summary);
		const missingUi = vision.detectedText.length === 0 && /laptop|screen|monitor|interface/.test(summary);
		if (inventedUi) {
			findings.push({
				code: 'fabricated_product_ui',
				severity: 'blocking',
				message: 'The analysis suggests fabricated product UI. Prefer compositing a real screenshot instead of inventing interface chrome.',
				advisory: true,
			});
		} else if (missingUi) {
			findings.push({
				code: 'product_ui_unclear',
				severity: 'major',
				message: 'A product reference was selected but little readable interface text was detected. Check that the screenshot remains legible.',
				advisory: true,
			});
		}
	}
	if (vision.detectedText.some((line) => /lorem|asdf|qwerty|xxxx/i.test(line))) {
		findings.push({
			code: 'text_artefacts',
			severity: 'major',
			message: 'Nonsense or placeholder text appears to be baked into the image.',
			advisory: true,
		});
	}
	const conceptTokens = tokens(input.concept || '');
	const visionTokens = new Set(tokens(`${vision.summary} ${vision.subjects.join(' ')} ${vision.setting}`));
	const overlap = conceptTokens.filter((token) => visionTokens.has(token)).length;
	if (conceptTokens.length >= 4 && overlap / conceptTokens.length < 0.15) {
		findings.push({
			code: 'subject_relevance',
			severity: 'minor',
			message: 'The generated scene may only weakly match the approved concept. Confirm subject relevance before accepting.',
			advisory: true,
		});
	}
	if (!findings.length) {
		findings.push({
			code: 'no_automated_defects',
			severity: 'minor',
			message: 'Automated checks found no obvious defects. Human review is still required for anatomy and brand fit.',
			advisory: true,
		});
	}
	return findings;
}

function tokens(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 2);
}

export function estimateRegenerationCostUsd(hasReferences: boolean): number {
	// Rough mid-quality estimate for planning UI only.
	return hasReferences ? 0.08 : 0.05;
}
