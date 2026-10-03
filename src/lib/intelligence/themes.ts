import type { ContentTheme, ThemePlan, ThemePlanPiece } from './types';
import { newId } from './store';

const CHANNEL_ADAPTATIONS: Array<{ channel: ThemePlanPiece['channel']; contentType: ThemePlanPiece['contentType']; how: string }> = [
	{ channel: 'blog', contentType: 'article', how: 'Develop the core idea as a substantiated long-form argument with proof and examples.' },
	{ channel: 'linkedin', contentType: 'founder_post', how: 'Personal point of view; one tension, one argument, no blog summary.' },
	{ channel: 'linkedin', contentType: 'company_post', how: 'Institutional voice; useful specific claim, not a founder anecdote copy.' },
	{ channel: 'x', contentType: 'short_post', how: 'Single sharp observation or line of argument; no thread padding.' },
	{ channel: 'x', contentType: 'thread', how: 'Sequence the argument; each post must stand alone while advancing the theme.' },
	{ channel: 'newsletter', contentType: 'newsletter', how: 'Direct-to-audience synthesis plus a next-step that is not a social CTA clone.' },
	{ channel: 'linkedin', contentType: 'follow_up', how: 'Respond to an implied objection or unanswered question from the core idea.' },
];

export function buildThemePlan(theme: ContentTheme, coreIdea: string, horizonWeeks = 6): ThemePlan {
	const requested = new Set((theme.channels.length ? theme.channels : ['linkedin', 'x', 'blog']).map((channel) => channel.toLowerCase()));
	const pieces = CHANNEL_ADAPTATIONS.filter((row) => requested.has(String(row.channel))).map((row, index) => {
		const subtopic = theme.subtopics[index % Math.max(theme.subtopics.length, 1)] || theme.title;
		return {
			id: newId(),
			channel: row.channel,
			contentType: row.contentType,
			title: `${subtopic} — ${row.contentType.replace('_', ' ')}`,
			angle: theme.keyArguments[index % Math.max(theme.keyArguments.length, 1)] || coreIdea,
			hookDirection: index === 0 ? 'problem-led' : index === 1 ? 'evidence-led' : 'objection-led',
			howItAdapts: row.how,
			relationshipToCoreIdea: `Same intellectual claim as "${coreIdea}", adapted to ${row.channel} rather than duplicated.`,
		};
	});

	return {
		id: newId(),
		themeId: theme.id,
		coreIdea,
		horizonWeeks,
		pieces,
		rationale: `Over ~${horizonWeeks} weeks, cover distinct subtopics of "${theme.title}" across channels so the brand becomes known for this area without repeating identical copy.`,
	};
}

export function themePlanToIdeas(plan: ThemePlan): string[] {
	return plan.pieces.map(
		(piece) =>
			`${piece.channel}/${piece.contentType}: ${piece.title} — ${piece.angle} (${piece.hookDirection}). ${piece.howItAdapts}`,
	);
}
