'use client';

import { useEffect, useState } from 'react';
import type { ImageCreativeBrief, MediaCreativeState } from '@/lib/articles/imageBrief';

type MediaState = {
	heroAssetId: string | null;
	ogAssetId: string | null;
	heroUrl: string | null;
	ogUrl: string | null;
	heroAlt: string;
	ogAlt: string;
	credit: string;
	license: string;
	deliveryVerified: boolean;
	deliveryError: string | null;
	creative?: MediaCreativeState;
};

type Props = {
	imageRequirements: string;
	media: MediaState;
	busy: boolean;
	pending: string | null;
	act: (action: string, body?: Record<string, unknown>, message?: string) => Promise<boolean>;
	onMetaChange: (next: { heroAlt: string; ogAlt: string; credit: string; license: string }) => void;
	meta: { heroAlt: string; ogAlt: string; credit: string; license: string };
};

const emptyBrief = (role: 'hero' | 'og'): ImageCreativeBrief => ({
	purpose: role,
	suggestedConcept: '',
	concept: '',
	prompt: '',
	negativeConstraints: '',
	referenceAssetIds: [],
	brandStyleNotes: '',
	dimensions: role === 'og' ? '1.91:1' : '16:9',
	revisionInstructions: '',
	estimatedCostUsd: null,
	lastCostUsd: null,
	similarityWarning: null,
	history: [],
	candidates: [],
});

export function ImagePanel({ imageRequirements, media, busy, pending, act, onMetaChange, meta }: Props) {
	const [role, setRole] = useState<'hero' | 'og'>('hero');
	const [brief, setBrief] = useState<ImageCreativeBrief>(media.creative?.[role] ?? emptyBrief(role));
	const [referenceId, setReferenceId] = useState('');

	useEffect(() => {
		setBrief(media.creative?.[role] ?? emptyBrief(role));
	}, [media.creative, role]);

	const activeUrl = role === 'hero' ? media.heroUrl : media.ogUrl;
	const activeAssetId = role === 'hero' ? media.heroAssetId : media.ogAssetId;

	return (
		<section className="card p-4 space-y-3" id="images">
			<h2 className="font-medium">Images</h2>
			<p className="text-sm">
				Requirement: {imageRequirements || '—'} · delivery {media.deliveryVerified ? 'verified' : 'not verified'}
				{media.deliveryError ? ` · ${media.deliveryError}` : ''}
			</p>
			<div className="flex flex-wrap gap-2">
				<button className={`btn ${role === 'hero' ? '' : 'opacity-70'}`} type="button" onClick={() => setRole('hero')}>
					Hero
				</button>
				<button className={`btn ${role === 'og' ? '' : 'opacity-70'}`} type="button" onClick={() => setRole('og')}>
					Social
				</button>
				<button
					className="btn"
					type="button"
					disabled={busy}
					onClick={() => void act('prepare_image_brief', { role }, 'Image brief prepared from the article and brand.')}
				>
					Suggest concept
				</button>
			</div>
			<div className="flex flex-wrap gap-4">
				{media.heroUrl ? (
					<figure className="text-xs">
						<img src={`${media.heroUrl}${media.heroAssetId ? `?v=${media.heroAssetId}` : ''}`} alt={media.heroAlt || 'Hero'} className="max-h-48 rounded" />
						<figcaption>Hero {media.heroAssetId ? `· ${media.heroAssetId.slice(0, 8)}` : ''}</figcaption>
					</figure>
				) : null}
				{media.ogUrl ? (
					<figure className="text-xs">
						<img src={`${media.ogUrl}${media.ogAssetId ? `?v=${media.ogAssetId}` : ''}`} alt={media.ogAlt || 'Social'} className="max-h-48 rounded" />
						<figcaption>Social {media.ogAssetId ? `· ${media.ogAssetId.slice(0, 8)}` : ''}</figcaption>
					</figure>
				) : null}
			</div>
			{brief.similarityWarning ? <p className="text-sm text-amber-700">{brief.similarityWarning}</p> : null}
			<div className="grid gap-3 md:grid-cols-2">
				<label className="block text-sm md:col-span-2">
					Concept
					<textarea className="input w-full min-h-20" value={brief.concept} onChange={(event) => setBrief({ ...brief, concept: event.target.value })} />
					{brief.suggestedConcept ? <span className="text-xs text-text-soft">Suggested: {brief.suggestedConcept}</span> : null}
				</label>
				<label className="block text-sm md:col-span-2">
					Editable prompt
					<textarea className="input w-full min-h-28 font-mono text-xs" value={brief.prompt} onChange={(event) => setBrief({ ...brief, prompt: event.target.value })} />
				</label>
				<label className="block text-sm">
					Negative constraints
					<textarea className="input w-full min-h-16" value={brief.negativeConstraints} onChange={(event) => setBrief({ ...brief, negativeConstraints: event.target.value })} />
				</label>
				<label className="block text-sm">
					Revision instructions
					<textarea className="input w-full min-h-16" value={brief.revisionInstructions} onChange={(event) => setBrief({ ...brief, revisionInstructions: event.target.value })} placeholder="Only used when regenerating" />
				</label>
				<label className="block text-sm">
					Brand style notes
					<textarea className="input w-full min-h-16" value={brief.brandStyleNotes} onChange={(event) => setBrief({ ...brief, brandStyleNotes: event.target.value })} />
				</label>
				<label className="block text-sm">
					Reference asset ID (product screenshot)
					<input className="input w-full" value={referenceId} onChange={(event) => setReferenceId(event.target.value)} placeholder="Library asset UUID" />
					<button
						className="btn mt-1"
						type="button"
						disabled={!referenceId.trim()}
						onClick={() => {
							const ids = Array.from(new Set([...(brief.referenceAssetIds ?? []), referenceId.trim()]));
							setBrief({ ...brief, referenceAssetIds: ids });
							setReferenceId('');
						}}
					>
						Add reference
					</button>
					{brief.referenceAssetIds.length ? <p className="text-xs mt-1">Refs: {brief.referenceAssetIds.join(', ')}</p> : null}
				</label>
			</div>
			<p className="text-xs text-text-soft">
				Purpose: {role} · Dimensions: {brief.dimensions}
				{brief.lastCostUsd != null ? ` · Last cost ≈ $${brief.lastCostUsd.toFixed(4)}` : ''}
				{activeAssetId ? ` · Active ${activeAssetId}` : ''}
				{activeUrl ? '' : ' · No active image yet'}
			</p>
			<div className="flex flex-wrap gap-2">
				<button
					className="btn"
					type="button"
					disabled={busy}
					onClick={() =>
						void act(
							'save_image_brief',
							{
								role,
								concept: brief.concept,
								prompt: brief.prompt,
								negativeConstraints: brief.negativeConstraints,
								revisionInstructions: brief.revisionInstructions,
								brandStyleNotes: brief.brandStyleNotes,
								referenceAssetIds: brief.referenceAssetIds,
							},
							'Image brief saved.',
						)
					}
				>
					Save brief
				</button>
				<button
					className="btn"
					type="button"
					disabled={busy}
					onClick={() =>
						void act(
							'media',
							{
								role,
								prompt: brief.prompt,
								concept: brief.concept,
								negativeConstraints: brief.negativeConstraints,
								revisionInstructions: brief.revisionInstructions,
								brandStyleNotes: brief.brandStyleNotes,
								referenceAssetIds: brief.referenceAssetIds,
								forceNew: true,
							},
							role === 'hero' ? 'Hero image generated.' : 'Social image generated.',
						)
					}
				>
					{pending === 'media' ? 'Generating…' : activeUrl ? 'Regenerate with this brief' : 'Generate'}
				</button>
			</div>
			{brief.candidates.length ? (
				<details className="text-sm">
					<summary>Generation history ({brief.candidates.length})</summary>
					<ul className="mt-2 space-y-2">
						{brief.candidates.map((candidate) => (
							<li key={candidate.assetId} className="flex flex-wrap items-center gap-2 border-b border-edge/40 pb-2">
								{candidate.url ? <img src={`${candidate.url}?v=${candidate.assetId}`} alt="" className="h-12 w-20 object-cover rounded" /> : null}
								<span className="text-xs grow">{candidate.concept.slice(0, 100)}{candidate.selected ? ' · selected' : ''}</span>
								<button
									className="btn"
									type="button"
									disabled={busy || candidate.selected}
									onClick={() => void act('media', { role, selectAssetId: candidate.assetId }, 'Selected previous image. Accepted asset was not deleted.')}
								>
									Use this version
								</button>
							</li>
						))}
					</ul>
				</details>
			) : null}
			<div className="grid gap-3 md:grid-cols-2">
				<label className="block text-sm">
					Hero alt text
					<input className="input w-full" value={meta.heroAlt} onChange={(event) => onMetaChange({ ...meta, heroAlt: event.target.value })} placeholder={media.heroUrl && !meta.heroAlt ? 'Vision unavailable — describe the image' : ''} />
				</label>
				<label className="block text-sm">
					Social image alt text
					<input className="input w-full" value={meta.ogAlt} onChange={(event) => onMetaChange({ ...meta, ogAlt: event.target.value })} />
				</label>
				<label className="block text-sm">
					Credit
					<input className="input w-full" value={meta.credit} onChange={(event) => onMetaChange({ ...meta, credit: event.target.value })} placeholder="Optional" />
				</label>
				<label className="block text-sm">
					Licence
					<input className="input w-full" value={meta.license} onChange={(event) => onMetaChange({ ...meta, license: event.target.value })} placeholder="Optional" />
				</label>
			</div>
			<button className="btn" type="button" disabled={busy} onClick={() => void act('media_meta', meta, 'Image details saved.')}>
				Save image details
			</button>
		</section>
	);
}
