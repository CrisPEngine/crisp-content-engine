'use client';

import { useEffect, useState } from 'react';
import { conceptRelevanceWarning, conceptSimilarityWarning, suggestImageConcepts, type ImageConceptOption, type ImageCreativeBrief, type MediaCreativeState } from '@/lib/articles/imageBrief';

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

type ReferenceProposal = {
	asset: { id: string; url?: string; title?: string; altText?: string; libraryType?: string };
	score: number;
	matchReason: string;
	libraryType: string;
	recommended: boolean;
	typeLabel: string;
};

type Props = {
	articleId: string;
	title: string;
	topic: string;
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
	promptManuallyEdited: false,
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
	qualityFindings: [],
	altStatus: undefined,
	effectivePrompt: '',
});

export function ImagePanel({ articleId, title, topic, imageRequirements, media, busy, pending, act, onMetaChange, meta }: Props) {
	const [role, setRole] = useState<'hero' | 'og'>('hero');
	const [brief, setBrief] = useState<ImageCreativeBrief>(media.creative?.[role] ?? emptyBrief(role));
	const [proposals, setProposals] = useState<ReferenceProposal[]>([]);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [conceptDirty, setConceptDirty] = useState(false);
	const [options, setOptions] = useState<ImageConceptOption[]>([]);
	const [referenceRoles, setReferenceRoles] = useState<Record<string, string>>({});

	useEffect(() => {
		setBrief(media.creative?.[role] ?? emptyBrief(role));
		setConceptDirty(false);
	}, [media.creative, role]);

	const activeUrl = role === 'hero' ? media.heroUrl : media.ogUrl;
	const activeAssetId = role === 'hero' ? media.heroAssetId : media.ogAssetId;
	const estimated = brief.estimatedCostUsd ?? 0.05;
	const findings = brief.qualityFindings ?? [];

	async function loadReferences() {
		const response = await fetch(`/api/articles/${articleId}/actions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'propose_image_references', role }),
		});
		const payload = await response.json();
		if (response.ok && Array.isArray(payload.proposals)) setProposals(payload.proposals);
	}

	return (
		<section className="card p-4 space-y-4" id="images">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h2 className="font-medium">Images</h2>
					<p className="text-sm text-text-soft">
						Workflow: concept → references → generate → quality → alt text → accept → delivery
					</p>
				</div>
				<p className="text-sm">
					Requirement: {imageRequirements || '—'} · delivery {media.deliveryVerified ? 'verified' : 'not verified'}
					{media.deliveryError ? ` · ${media.deliveryError}` : ''}
				</p>
			</div>

			<div className="flex flex-wrap gap-2">
				<button className={`btn ${role === 'hero' ? '' : 'opacity-70'}`} type="button" onClick={() => setRole('hero')}>
					Hero {media.heroUrl ? '· set' : '· empty'}
				</button>
				<button className={`btn ${role === 'og' ? '' : 'opacity-70'}`} type="button" onClick={() => setRole('og')}>
					Social {media.ogUrl ? '· set' : '· empty'}
				</button>
			</div>

			<div className="flex flex-wrap gap-4">
				{media.heroUrl ? (
					<figure className="text-xs">
						<img src={`${media.heroUrl}?v=${media.heroAssetId || 'hero'}`} alt={media.heroAlt || ''} className="max-h-48 rounded" />
						<figcaption>Hero {activeAssetId && role === 'hero' ? '(selected role)' : ''}</figcaption>
					</figure>
				) : null}
				{media.ogUrl ? (
					<figure className="text-xs">
						<img src={`${media.ogUrl}?v=${media.ogAssetId || 'og'}`} alt={media.ogAlt || ''} className="max-h-48 rounded" />
						<figcaption>Social</figcaption>
					</figure>
				) : null}
			</div>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">1. Image concept</h3>
				<textarea
					className="input w-full min-h-24"
					value={brief.concept}
					onChange={(event) => {
						setBrief({ ...brief, concept: event.target.value });
						setConceptDirty(true);
					}}
					placeholder="Visually actionable scene: subject, setting, action, mood, composition"
				/>
				{brief.similarityWarning ? <p className="text-sm text-amber-700">{brief.similarityWarning}</p> : null}
				{conceptRelevanceWarning(brief.concept, title, topic) ? <p className="text-sm text-danger">{conceptRelevanceWarning(brief.concept, title, topic)}</p> : null}
				{brief.history[0]?.concept && brief.concept.trim() && brief.history[0].concept.trim() !== brief.concept.trim() ? (
					<p className="text-sm text-warning">The current image was generated from an older concept. Editing this text does not change that image.</p>
				) : null}
				<div className="flex flex-wrap gap-2">
					<button
						className="btn"
						type="button"
						disabled={busy}
						onClick={() => {
							const next = suggestImageConcepts({ role, title, topic, imageRequirements });
							setOptions(next);
							const choice = next.find((item) => !conceptRelevanceWarning(item.description, title, topic)) ?? next[0];
							if (!choice) return;
							const warning = conceptSimilarityWarning(choice.description, brief.history.map((item) => item.concept));
							setBrief({ ...brief, concept: choice.description, suggestedConcept: choice.description, revisionInstructions: '', similarityWarning: warning });
							setConceptDirty(true);
						}}
					>
						Suggest three concepts
					</button>
					{conceptDirty ? (
						<button
							className="btn"
							type="button"
							disabled={busy}
							onClick={() =>
								void act(
									'save_image_brief',
									{ role, concept: brief.concept },
									'Concept saved.',
								).then((ok) => ok && act('prepare_image_brief', { role, rebuildPrompt: true }, 'Technical prompt rebuilt from the concept.'))
							}
						>
							Rebuild prompt from concept
						</button>
					) : null}
				</div>
				{options.length ? (
					<ul className="space-y-2">
						{options.map((option) => (
							<li key={option.id} className="rounded border border-edge/50 p-2">
								<p className="font-medium">{option.title}</p>
								<p>{option.description}</p>
								<p className="text-xs text-text-soft">{option.rationale} Intended message: {option.message}</p>
								<button className="btn mt-2" type="button" onClick={() => { setBrief({ ...brief, concept: option.description, revisionInstructions: '' }); setConceptDirty(true); }}>Use this concept</button>
							</li>
						))}
					</ul>
				) : null}
			</section>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">2. Reference assets</h3>
				<p className="text-xs text-text-soft">Brand-scoped only. Product screenshots preserve real UI; they are not required for every article.</p>
				<button className="btn" type="button" disabled={busy} onClick={() => void loadReferences()}>
					Find brand assets
				</button>
				{proposals.length ? (
					<ul className="grid gap-2 md:grid-cols-2">
						{proposals.map((proposal) => {
							const selected = brief.referenceAssetIds.includes(proposal.asset.id);
							return (
								<li key={proposal.asset.id} className="rounded border border-edge/50 p-2 text-sm space-y-1">
									{proposal.asset.url ? (
										<img src={proposal.asset.url} alt={proposal.asset.altText || proposal.asset.title || ''} className="h-20 w-full object-cover rounded" />
									) : null}
									<p className="font-medium">{proposal.asset.title || proposal.typeLabel}</p>
									<p className="text-xs text-text-soft">
										{proposal.typeLabel}
										{proposal.recommended ? ' · recommended' : ''} · {proposal.matchReason}
									</p>
									<label className="block text-xs">
										Role
										<select
											className="input ml-2"
											value={referenceRoles[proposal.asset.id] ?? (proposal.libraryType === 'PRODUCT_SCREENSHOT' || proposal.libraryType === 'PRODUCT_UI' ? 'product' : 'style')}
											onChange={(event) => setReferenceRoles({ ...referenceRoles, [proposal.asset.id]: event.target.value })}
										>
											<option value="product">Product UI reference</option>
											<option value="style">Style reference</option>
											<option value="composition">Composition reference</option>
											<option value="subject">Subject reference</option>
										</select>
									</label>
									<button
										className="btn"
										type="button"
										onClick={() => {
											const referenceAssetIds = selected
												? brief.referenceAssetIds.filter((id) => id !== proposal.asset.id)
												: [...brief.referenceAssetIds, proposal.asset.id];
											setBrief({ ...brief, referenceAssetIds });
										}}
									>
										{selected ? 'Remove from generation' : 'Use as reference'}
									</button>
								</li>
							);
						})}
					</ul>
				) : null}
				{brief.referenceAssetIds.length ? (
					<div className="flex flex-wrap gap-2 items-center text-xs">
						<span>Selected ({brief.referenceAssetIds.length}):</span>
						{brief.referenceAssetIds.map((id) => {
							const proposal = proposals.find((row) => row.asset.id === id);
							return proposal?.asset.url ? (
								<img key={id} src={proposal.asset.url} alt={proposal.asset.title || 'Reference'} className="h-10 w-14 object-cover rounded" title={proposal.typeLabel} />
							) : (
								<span key={id} className="rounded border border-edge/40 px-1.5 py-0.5">
									{proposal?.asset.title || proposal?.typeLabel || 'Reference'}
								</span>
							);
						})}
						{brief.referenceAssetIds.some((id) => {
							const type = proposals.find((row) => row.asset.id === id)?.libraryType;
							return type === 'PRODUCT_SCREENSHOT' || type === 'PRODUCT_UI';
						}) ? (
							<span className="text-text-soft">Product screenshots keep real UI; the model must not invent interface chrome.</span>
						) : null}
					</div>
				) : null}
			</section>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">3. Generate</h3>
				<p className="text-xs text-text-soft">
					Estimated cost ≈ ${estimated.toFixed(3)} · model {brief.model || 'configured default'} · {brief.dimensions}
				</p>
				<label className="block text-sm">
					Changes for the existing image
					<textarea
						className="input w-full min-h-16"
						value={brief.revisionInstructions}
						onChange={(event) => setBrief({ ...brief, revisionInstructions: event.target.value })}
						placeholder="Used only by Revise existing image. A new concept ignores this."
					/>
				</label>
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
									promptManuallyEdited: brief.promptManuallyEdited,
									negativeConstraints: brief.negativeConstraints,
									revisionInstructions: brief.revisionInstructions,
									brandStyleNotes: brief.brandStyleNotes,
									referenceAssetIds: brief.referenceAssetIds,
									effectivePrompt: brief.prompt,
								},
								'Brief saved.',
							)
						}
					>
						Save brief
					</button>
					<button
						className="btn"
						type="button"
						disabled={busy || !brief.concept.trim()}
						onClick={() =>
							void act(
								'media',
								{
									role,
									concept: brief.concept,
									negativeConstraints: brief.negativeConstraints,
									revisionInstructions: '',
									brandStyleNotes: [brief.brandStyleNotes, ...brief.referenceAssetIds.map((id) => `${referenceRoles[id] ?? 'style'} reference`)].filter(Boolean).join('. '),
									referenceAssetIds: brief.referenceAssetIds,
									forceNew: true,
									useStoredPrompt: false,
								},
								'New image generated from the selected concept. The previous image remains in history.',
							)
						}
					>
						{pending === 'media' ? 'Generating…' : 'Generate from new concept'}
					</button>
					<button
						className="btn"
						type="button"
						disabled={busy || !activeUrl || !brief.revisionInstructions.trim()}
						onClick={() =>
							void act(
								'media',
								{
									role,
									concept: brief.concept,
									negativeConstraints: brief.negativeConstraints,
									revisionInstructions: brief.revisionInstructions,
									brandStyleNotes: brief.brandStyleNotes,
									referenceAssetIds: brief.referenceAssetIds,
									forceNew: true,
									useStoredPrompt: false,
								},
								'Existing image revised. The previous version remains in history.',
							)
						}
					>
						Revise existing image
					</button>
				</div>
			</section>

			<details open={showAdvanced} onToggle={(event) => setShowAdvanced((event.target as HTMLDetailsElement).open)}>
				<summary className="text-sm font-medium cursor-pointer">Advanced technical prompt</summary>
				<div className="pt-2 space-y-2">
					<label className="block text-sm">
						Effective prompt sent to the model
						<textarea
							className="input w-full min-h-36 font-mono text-xs"
							value={brief.prompt}
							onChange={(event) => setBrief({ ...brief, prompt: event.target.value, promptManuallyEdited: true, effectivePrompt: event.target.value })}
						/>
					</label>
					<label className="block text-sm">
						Negative constraints
						<textarea
							className="input w-full min-h-16"
							value={brief.negativeConstraints}
							onChange={(event) => setBrief({ ...brief, negativeConstraints: event.target.value })}
						/>
					</label>
					<label className="block text-sm">
						Brand style notes
						<textarea
							className="input w-full min-h-16"
							value={brief.brandStyleNotes}
							onChange={(event) => setBrief({ ...brief, brandStyleNotes: event.target.value })}
						/>
					</label>
				</div>
			</details>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">4. Quality review</h3>
				{findings.length ? (
					<ul className="text-sm space-y-1">
						{findings.map((finding) => (
							<li key={finding.code}>
								<span className="font-medium">{finding.severity}</span>: {finding.message}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-text-soft">Generate an image to run advisory quality checks.</p>
				)}
				<p className="text-xs text-text-soft">Automated assessment is advisory and can be overridden when you accept an image.</p>
			</section>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">5. Alt text</h3>
				<p className="text-xs">Status: {brief.altStatus || (role === 'hero' ? (meta.heroAlt ? 'manual/generated' : 'empty') : meta.ogAlt ? 'manual/generated' : 'empty')}</p>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">
						Hero alt text
						<input className="input w-full" value={meta.heroAlt} onChange={(event) => onMetaChange({ ...meta, heroAlt: event.target.value })} />
					</label>
					<label className="block text-sm">
						Social alt text
						<input className="input w-full" value={meta.ogAlt} onChange={(event) => onMetaChange({ ...meta, ogAlt: event.target.value })} />
					</label>
				</div>
				<button className="btn" type="button" disabled={busy || !activeAssetId} onClick={() => void act('refresh_image_alt', { role }, 'Alt text refreshed from the selected image.')}>
					Retry alt text from selected image
				</button>
			</section>

			<section className="space-y-2">
				<h3 className="text-sm font-medium">6. Accept / history</h3>
				{brief.candidates.length ? (
					<ul className="space-y-2 text-sm">
						{brief.candidates.map((candidate) => (
							<li key={candidate.assetId} className="flex flex-wrap items-center gap-2 border-b border-edge/40 pb-2">
								{candidate.url ? <img src={`${candidate.url}?v=${candidate.assetId}`} alt="" className="h-12 w-20 object-cover rounded" /> : null}
								<span className="text-xs grow">
									{candidate.concept.slice(0, 100)}
									{candidate.selected ? ' · selected' : ''}
									{candidate.accepted ? ' · accepted' : ''}
									{candidate.model ? ` · ${candidate.model}` : ''}
								</span>
								<button className="btn" type="button" disabled={busy} onClick={() => void act('media', { role, selectAssetId: candidate.assetId }, 'Previous version selected.')}>
									Select
								</button>
								<button className="btn" type="button" disabled={busy} onClick={() => void act('accept_image_candidate', { role, assetId: candidate.assetId }, 'Image accepted.')}>
									Accept
								</button>
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-text-soft">No generation history yet for this role.</p>
				)}
			</section>

			<div className="grid gap-3 md:grid-cols-2">
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
