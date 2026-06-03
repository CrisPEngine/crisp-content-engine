import { useCallback, useEffect, useState } from 'react';
import type { Brand, DraftResult, SidecarConfig } from '../lib/api';
import {
	createContentIdea,
	fetchBrands,
	fetchConfig,
	generateDraft,
	saveContact,
	saveOpportunity,
} from '../lib/api';
import { captureActiveTabContext } from '../lib/context';
import { detectPlatformFromUrl } from '../lib/platform';
import { loadSettings, saveSettings, type SidecarSettings } from '../lib/settings';

const EMPTY_ERROR =
	'Sidecar could not generate a draft. Check the API connection, selected brand and available AI configuration.';

const EMPTY_STATE =
	'Select a post, comment, profile note or conversation snippet, then open Sidecar to draft a reply or message in the right brand voice.';

export function App() {
	const [config, setConfig] = useState<SidecarConfig | null>(null);
	const [brands, setBrands] = useState<Brand[]>([]);
	const [settings, setSettings] = useState<SidecarSettings | null>(null);
	const [showSettings, setShowSettings] = useState(false);

	const [selectedText, setSelectedText] = useState('');
	const [pageUrl, setPageUrl] = useState('');
	const [pageTitle, setPageTitle] = useState('');
	const [platform, setPlatform] = useState('web');
	const [userNotes, setUserNotes] = useState('');

	const [brandId, setBrandId] = useState('');
	const [messageType, setMessageType] = useState('');
	const [objective, setObjective] = useState('');
	const [ctaStrength, setCtaStrength] = useState('Soft');
	const [relationshipStage, setRelationshipStage] = useState('Unknown');
	const [contactType, setContactType] = useState('Other');
	const [consentStatus, setConsentStatus] = useState('Unknown');

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [draft, setDraft] = useState<DraftResult | null>(null);

	const refreshContext = useCallback(async () => {
		const ctx = await captureActiveTabContext();
		if (ctx) {
			setSelectedText(ctx.selectedText);
			setPageUrl(ctx.pageUrl);
			setPageTitle(ctx.pageTitle);
			setPlatform(detectPlatformFromUrl(ctx.pageUrl));
		}
	}, []);

	const bootstrap = useCallback(async () => {
		setError(null);
		try {
			const [cfg, brandList, stored] = await Promise.all([
				fetchConfig(),
				fetchBrands(),
				loadSettings(),
			]);
			setConfig(cfg);
			setBrands(brandList.brands);
			setSettings(stored);
			setBrandId((prev) => prev || brandList.brands[0]?.id || '');
			setMessageType((prev) => prev || cfg.enums.messageTypes[0] || '');
			setObjective((prev) => prev || cfg.enums.objectives[0] || '');
		} catch (err) {
			setError(err instanceof Error ? err.message : EMPTY_ERROR);
		}
	}, [refreshContext]);

	useEffect(() => {
		void bootstrap();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
	}, []);

	const selectedBrand = brands.find((b) => b.id === brandId);

	const buildDraftPayload = (existingDraft?: string) => ({
		brandId,
		platform,
		pageUrl,
		pageTitle,
		selectedText,
		userNotes,
		messageType,
		objective,
		ctaStrength,
		relationshipStage,
		...(existingDraft ? { existingDraft } : {}),
	});

	const handleGenerate = async () => {
		if (!brandId) {
			setError('Select a brand first.');
			return;
		}
		setLoading(true);
		setError(null);
		setStatusMessage(null);
		try {
			const result = await generateDraft(buildDraftPayload());
			setDraft(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : EMPTY_ERROR);
			setDraft(null);
		} finally {
			setLoading(false);
		}
	};

	const handleRewrite = async () => {
		if (!draft?.draftText) return;
		setLoading(true);
		setError(null);
		try {
			const result = await generateDraft(buildDraftPayload(draft.draftText));
			setDraft(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : EMPTY_ERROR);
		} finally {
			setLoading(false);
		}
	};

	const handleCopy = async () => {
		if (!draft?.draftText) return;
		await navigator.clipboard.writeText(draft.draftText);
		setStatusMessage('Draft copied to clipboard.');
	};

	const handleSaveOpportunity = async () => {
		if (!selectedBrand || !draft) return;
		setLoading(true);
		setError(null);
		try {
			await saveOpportunity({
				brand: selectedBrand.name,
				brandId,
				platform,
				pageUrl,
				pageTitle,
				sourceText: selectedText,
				messageType,
				objective,
				ctaStrength,
				relationshipStage,
				draftText: draft.draftText,
				fitScore: draft.fitScore,
				opportunitySummary: draft.opportunitySummary,
				shortAlternative: draft.shortAlternative,
				recommendedAction: draft.recommendedAction,
				ctaRecommendation: draft.ctaRecommendation,
				linkRecommendation: draft.linkRecommendation,
				riskNotes: draft.riskNotes,
				suggestedFollowUp: draft.suggestedFollowUp,
				suggestedTags: draft.suggestedTags,
				status: 'Drafted',
				notes: userNotes,
			});
			setStatusMessage('Opportunity saved to CCE.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save opportunity.');
		} finally {
			setLoading(false);
		}
	};

	const handleSaveContact = async () => {
		if (!selectedBrand || !config?.features.saveContacts) return;
		setLoading(true);
		setError(null);
		try {
			const result = await saveContact({
				brand: selectedBrand.name,
				brandId,
				platform,
				contactType,
				relationshipStage,
				consentStatus,
				sourceUrl: pageUrl,
				sourceContext: selectedText || pageTitle,
				notes: userNotes,
				tags: draft?.suggestedTags || [],
			});
			setStatusMessage(result.updated ? 'Contact updated.' : 'Contact saved.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save contact.');
		} finally {
			setLoading(false);
		}
	};

	const handleContentIdea = async () => {
		if (!selectedBrand || !draft?.suggestedContentIdea || !config?.features.contentIdeas) return;
		const idea = draft.suggestedContentIdea;
		setLoading(true);
		setError(null);
		try {
			await createContentIdea({
				brand: selectedBrand.name,
				brandId,
				platform,
				pageUrl,
				selectedText,
				suggestedTitle: idea.title,
				suggestedHook: idea.hook,
				suggestedAngle: idea.angle,
				topicBucket: idea.topicBucket,
				objective,
				notes: userNotes,
				sourceUrl: pageUrl,
			});
			setStatusMessage('Content idea created in ContentQueue.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create content idea.');
		} finally {
			setLoading(false);
		}
	};

	const handleSaveSettings = async () => {
		if (!settings) return;
		await saveSettings(settings);
		setShowSettings(false);
		setStatusMessage('Settings saved. Reloading…');
		await bootstrap();
	};

	const hasContext = Boolean(selectedText.trim() || pageUrl);

	return (
		<div className="app">
			<header className="header">
				<div>
					<h1>CRISP Sidecar</h1>
					<div className="header-meta">Platform: {platform}</div>
				</div>
				<button
					type="button"
					className="icon-btn"
					title="Settings"
					onClick={() => setShowSettings((v) => !v)}
				>
					⚙
				</button>
			</header>

			{showSettings && settings && (
				<div className="settings-panel">
					<div className="field">
						<label htmlFor="apiBaseUrl">CCE API URL</label>
						<input
							id="apiBaseUrl"
							value={settings.apiBaseUrl}
							onChange={(e) => setSettings({ ...settings, apiBaseUrl: e.target.value })}
						/>
					</div>
					<div className="field">
						<label htmlFor="apiToken">API token (Bearer)</label>
						<input
							id="apiToken"
							type="password"
							value={settings.apiToken}
							onChange={(e) => setSettings({ ...settings, apiToken: e.target.value })}
						/>
					</div>
					<div className="actions">
						<button type="button" className="btn btn-primary" onClick={() => void handleSaveSettings()}>
							Save settings
						</button>
						<button type="button" className="btn btn-secondary" onClick={() => setShowSettings(false)}>
							Cancel
						</button>
					</div>
				</div>
			)}

			<main className="main">
				{error && <div className="banner banner-error">{error}</div>}
				{statusMessage && <div className="banner banner-success">{statusMessage}</div>}

				{!hasContext && !draft && (
					<div className="banner banner-info">{EMPTY_STATE}</div>
				)}

				<div className="actions">
					<button type="button" className="btn btn-secondary" onClick={() => void refreshContext()}>
						Refresh page context
					</button>
				</div>

				<div className="field">
					<label htmlFor="brand">Brand</label>
					<select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
						{brands.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</div>

				<div className="field">
					<label htmlFor="messageType">Message type</label>
					<select
						id="messageType"
						value={messageType}
						onChange={(e) => setMessageType(e.target.value)}
					>
						{(config?.enums.messageTypes || []).map((v) => (
							<option key={v} value={v}>
								{v}
							</option>
						))}
					</select>
				</div>

				<div className="field">
					<label htmlFor="objective">Objective</label>
					<select id="objective" value={objective} onChange={(e) => setObjective(e.target.value)}>
						{(config?.enums.objectives || []).map((v) => (
							<option key={v} value={v}>
								{v}
							</option>
						))}
					</select>
				</div>

				<div className="field">
					<label htmlFor="ctaStrength">CTA strength</label>
					<select
						id="ctaStrength"
						value={ctaStrength}
						onChange={(e) => setCtaStrength(e.target.value)}
					>
						{(config?.enums.ctaStrengths || []).map((v) => (
							<option key={v} value={v}>
								{v}
							</option>
						))}
					</select>
				</div>

				<div className="field">
					<label htmlFor="relationshipStage">Relationship stage</label>
					<select
						id="relationshipStage"
						value={relationshipStage}
						onChange={(e) => setRelationshipStage(e.target.value)}
					>
						{(config?.enums.relationshipStages || []).map((v) => (
							<option key={v} value={v}>
								{v}
							</option>
						))}
					</select>
				</div>

				<div className="field">
					<label>Selected text</label>
					<div className="preview">{selectedText || '(none — select text on the page, then refresh)'}</div>
				</div>

				<div className="field">
					<label>Page URL</label>
					<div className="preview">{pageUrl || '(none)'}</div>
				</div>

				<div className="field">
					<label htmlFor="notes">Notes</label>
					<textarea
						id="notes"
						value={userNotes}
						onChange={(e) => setUserNotes(e.target.value)}
						placeholder="Optional context for the draft"
					/>
				</div>

				<div className="actions">
					<button
						type="button"
						className="btn btn-primary"
						disabled={loading || !brandId}
						onClick={() => void handleGenerate()}
					>
						{loading ? 'Generating…' : 'Generate draft'}
					</button>
					{draft && (
						<button
							type="button"
							className="btn btn-secondary"
							disabled={loading}
							onClick={() => void handleRewrite()}
						>
							Rewrite my draft
						</button>
					)}
				</div>

				{draft && (
					<section className="output">
						<div className="meta-row">
							<h2>Draft</h2>
							<span className="fit-score">Fit {draft.fitScore}/10</span>
						</div>
						<div className="draft-box">{draft.draftText}</div>

						<div className="detail-block">
							<strong>Short alternative</strong>
							{draft.shortAlternative}
						</div>
						<div className="detail-block">
							<strong>Recommended action</strong>
							{draft.recommendedAction}
						</div>
						<div className="detail-block">
							<strong>CTA recommendation</strong>
							{draft.ctaRecommendation}
						</div>
						<div className="detail-block">
							<strong>Link recommendation</strong>
							{draft.linkRecommendation}
						</div>
						<div className="detail-block">
							<strong>Risk notes</strong>
							{draft.riskNotes}
						</div>
						<div className="detail-block">
							<strong>Suggested follow-up</strong>
							{draft.suggestedFollowUp}
						</div>
						{draft.suggestedTags?.length > 0 && (
							<div className="detail-block">
								<strong>Suggested tags</strong>
								<div className="tags">
									{draft.suggestedTags.map((tag) => (
										<span key={tag} className="tag">
											{tag}
										</span>
									))}
								</div>
							</div>
						)}

						<div className="actions">
							<button type="button" className="btn btn-primary" onClick={() => void handleCopy()}>
								Copy draft
							</button>
							<button
								type="button"
								className="btn btn-secondary"
								disabled={loading}
								onClick={() => void handleSaveOpportunity()}
							>
								Save opportunity
							</button>
							{config?.features.saveContacts && (
								<button
									type="button"
									className="btn btn-secondary"
									disabled={loading}
									onClick={() => void handleSaveContact()}
								>
									Save contact
								</button>
							)}
							{config?.features.contentIdeas && draft.suggestedContentIdea && (
								<button
									type="button"
									className="btn btn-secondary"
									disabled={loading}
									onClick={() => void handleContentIdea()}
								>
									Create content idea
								</button>
							)}
						</div>
					</section>
				)}

				{config?.features.saveContacts && (
					<>
						<div className="field">
							<label htmlFor="contactType">Contact type (for save)</label>
							<select
								id="contactType"
								value={contactType}
								onChange={(e) => setContactType(e.target.value)}
							>
								{config.enums.contactTypes.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</select>
						</div>
						<div className="field">
							<label htmlFor="consentStatus">Consent status</label>
							<select
								id="consentStatus"
								value={consentStatus}
								onChange={(e) => setConsentStatus(e.target.value)}
							>
								{config.enums.consentStatuses.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</select>
						</div>
					</>
				)}
			</main>
		</div>
	);
}
