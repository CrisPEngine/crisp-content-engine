import { useCallback, useEffect, useState } from 'react';
import type { Brand, BrandsMeta, DraftResult, SidecarConfig, ConnectionTestResult } from '../lib/api';
import {
	createContentIdea,
	generateDraft,
	saveContact,
	saveOpportunity,
	testConnection,
} from '../lib/api';
import { captureActiveTabContext } from '../lib/context';
import { formatApiErrorForUi, SidecarApiError } from '../lib/errors';
import {
	DEFAULT_SETTINGS,
	isSettingsComplete,
	loadSettings,
	type SidecarSettings,
} from '../lib/settings';
import { SettingsPanel } from './SettingsPanel';

const EMPTY_DRAFT_ERROR =
	'Sidecar could not generate a draft. Check the API connection, selected brand and available AI configuration.';

const EMPTY_STATE =
	'Select a post, comment, profile note or conversation snippet, then click Refresh page context.';

type AppPhase = 'loading' | 'setup' | 'ready';

export function App() {
	const [phase, setPhase] = useState<AppPhase>('loading');
	const [settings, setSettings] = useState<SidecarSettings>(DEFAULT_SETTINGS);
	const [showSettings, setShowSettings] = useState(false);
	const [connected, setConnected] = useState(false);

	const [config, setConfig] = useState<SidecarConfig | null>(null);
	const [brands, setBrands] = useState<Brand[]>([]);
	const [brandsMeta, setBrandsMeta] = useState<BrandsMeta | null>(null);

	const [selectedText, setSelectedText] = useState('');
	const [pageUrl, setPageUrl] = useState('');
	const [pageTitle, setPageTitle] = useState('');
	const [platform, setPlatform] = useState('web');
	const [userNotes, setUserNotes] = useState('');
	const [contextMessage, setContextMessage] = useState<string | null>(null);

	const [brandId, setBrandId] = useState('');
	const [messageType, setMessageType] = useState('Public reply');
	const [objective, setObjective] = useState('Community value');
	const [ctaStrength, setCtaStrength] = useState('Soft');
	const [relationshipStage, setRelationshipStage] = useState('Unknown');
	const [contactType, setContactType] = useState('Other');
	const [consentStatus, setConsentStatus] = useState('Unknown');

	const [loading, setLoading] = useState(false);
	const [contextRefreshing, setContextRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [draft, setDraft] = useState<DraftResult | null>(null);

	const applyConnection = useCallback((result: ConnectionTestResult) => {
		setConfig(result.config);
		setBrands(result.brands);
		setBrandsMeta(result.brandsMeta);
		setBrandId((prev) => prev || result.brands[0]?.id || '');
		setMessageType((prev) =>
			result.config.enums.messageTypes.includes(prev)
				? prev
				: result.config.enums.messageTypes[0] || prev,
		);
		setObjective((prev) =>
			result.config.enums.objectives.includes(prev)
				? prev
				: result.config.enums.objectives[0] || prev,
		);
		setConnected(true);
		setPhase('ready');
	}, []);

	const loadAppData = useCallback(
		async (stored: SidecarSettings) => {
			const result = await testConnection(stored);
			applyConnection(result);
		},
		[applyConnection],
	);

	useEffect(() => {
		void (async () => {
			const stored = await loadSettings();
			setSettings(stored);
			if (!isSettingsComplete(stored)) {
				setPhase('setup');
				setShowSettings(true);
				return;
			}
			try {
				await loadAppData(stored);
			} catch {
				setPhase('setup');
				setShowSettings(true);
			}
		})();
	}, [loadAppData]);

	const refreshContext = useCallback(async () => {
		setContextRefreshing(true);
		setContextMessage(null);
		try {
			const result = await captureActiveTabContext();

			if (result.ok) {
				setSelectedText(result.context.selectedText);
				setPageUrl(result.context.pageUrl);
				setPageTitle(result.context.pageTitle);
				setPlatform(result.context.platform);
				setContextMessage(
					result.context.selectedText
						? `Page context updated (${result.context.hostname || result.context.platform}).`
						: `Page URL captured (${result.context.hostname || result.context.platform}). No text selected — select text on the page and refresh again.`,
				);
				return;
			}

			if (result.partial?.pageUrl && result.kind !== 'wrong_tab') {
				setSelectedText(result.partial.selectedText);
				setPageUrl(result.partial.pageUrl);
				setPageTitle(result.partial.pageTitle);
				setPlatform(result.partial.platform);
			}
			setContextMessage(result.message);
		} finally {
			setContextRefreshing(false);
		}
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

	const runApiAction = async (action: () => Promise<void>) => {
		if (!isSettingsComplete(settings)) {
			setError('Configure API URL and Bearer token in Settings first.');
			setPhase('setup');
			setShowSettings(true);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await action();
		} catch (err) {
			const apiError =
				err instanceof SidecarApiError
					? err
					: new SidecarApiError(err instanceof Error ? err.message : EMPTY_DRAFT_ERROR, {
							kind: 'unknown',
						});
			setError(formatApiErrorForUi(apiError));
		} finally {
			setLoading(false);
		}
	};

	const handleGenerate = () =>
		runApiAction(async () => {
			if (!brandId) {
				setError('Select a brand first.');
				return;
			}
			const result = await generateDraft(settings, buildDraftPayload());
			setDraft(result);
			setStatusMessage(null);
		});

	const handleRewrite = () =>
		runApiAction(async () => {
			if (!draft?.draftText) return;
			const result = await generateDraft(settings, buildDraftPayload(draft.draftText));
			setDraft(result);
		});

	const handleCopy = async () => {
		if (!draft?.draftText) return;
		await navigator.clipboard.writeText(draft.draftText);
		setStatusMessage('Draft copied to clipboard.');
	};

	const handleSaveOpportunity = () =>
		runApiAction(async () => {
			if (!selectedBrand || !draft) return;
			await saveOpportunity(settings, {
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
		});

	const handleSaveContact = () =>
		runApiAction(async () => {
			if (!selectedBrand || !config?.features.saveContacts) return;
			const result = await saveContact(settings, {
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
		});

	const handleContentIdea = () =>
		runApiAction(async () => {
			if (!selectedBrand || !draft?.suggestedContentIdea || !config?.features.contentIdeas) return;
			const idea = draft.suggestedContentIdea;
			await createContentIdea(settings, {
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
		});

	const openSettings = () => {
		setShowSettings(true);
		setError(null);
	};

	const hasContext = Boolean(selectedText.trim() || pageUrl.trim());

	if (phase === 'loading') {
		return (
			<div className="app">
				<header className="header">
					<h1>CRISP Sidecar</h1>
				</header>
				<main className="main">
					<div className="banner banner-info">Loading…</div>
				</main>
			</div>
		);
	}

	if (phase === 'setup') {
		return (
			<div className="app">
				<header className="header">
					<div>
						<h1>CRISP Sidecar</h1>
						<div className="header-meta">Setup</div>
					</div>
				</header>
				<main className="main main--setup">
					<SettingsPanel
						variant="setup"
						settings={settings}
						onChange={setSettings}
						onSaved={(s) => setSettings(s)}
						onConnected={(result) => {
							applyConnection(result);
							setShowSettings(false);
							if (result.brands.length === 0 && result.brandsMeta.emptyReason) {
								setError(`Brands: ${result.brandsMeta.emptyReason}`);
							} else {
								setError(null);
								setStatusMessage('Connected to CCE.');
							}
						}}
					/>
				</main>
			</div>
		);
	}

	return (
		<div className="app">
			<header className="header">
				<div>
					<h1>CRISP Sidecar</h1>
					<div className="header-meta">
						Platform: {platform}
						{connected ? ' · Connected' : ''}
					</div>
				</div>
				<div className="header-actions">
					<button type="button" className="btn btn-ghost btn-sm" onClick={openSettings}>
						Settings
					</button>
				</div>
			</header>

			{showSettings && (
				<SettingsPanel
					variant="inline"
					settings={settings}
					onChange={setSettings}
					onSaved={(s) => {
						setSettings(s);
						setStatusMessage('Settings saved.');
					}}
					onConnected={(result) => {
						applyConnection(result);
						setShowSettings(false);
						if (result.brands.length === 0 && result.brandsMeta.emptyReason) {
							setError(`Brands: ${result.brandsMeta.emptyReason}`);
						} else {
							setError(null);
							setStatusMessage('Connected to CCE.');
						}
					}}
					onClose={() => setShowSettings(false)}
				/>
			)}

			<main className="main">
				{error && <div className="banner banner-error">{error}</div>}
				{statusMessage && <div className="banner banner-success">{statusMessage}</div>}
				{contextMessage && !error && <div className="banner banner-info">{contextMessage}</div>}

				{!hasContext && !draft && <div className="banner banner-info">{EMPTY_STATE}</div>}

				<div className="actions">
					<button
						type="button"
						className="btn btn-secondary"
						disabled={contextRefreshing}
						onClick={() => void refreshContext()}
					>
						{contextRefreshing ? 'Refreshing…' : 'Refresh page context'}
					</button>
				</div>

				<div className="field">
					<label htmlFor="brand">Brand</label>
					<select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
						{brands.length === 0 && <option value="">No brands loaded</option>}
						{brands.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
					{brands.length === 0 && brandsMeta && (
						<p className="field-hint field-hint--warn">
							{brandsMeta.emptyReason ||
								`Airtable returned ${brandsMeta.airtableCount} record(s); none are available in Sidecar.`}
							{brandsMeta.allowlistActive ? ' (allowlist active)' : ''}
							{brandsMeta.userFilterActive ? ' (user filter active)' : ''}
						</p>
					)}
					{brands.length > 0 && brandsMeta && (
						<p className="field-hint">
							{brands.length} brand(s) from Airtable
							{brandsMeta.allowlistActive ? ' · allowlist applied' : ''}
						</p>
					)}
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
					<div className="preview">
						{selectedText || '(none — select text on the page, then Refresh)'}
					</div>
				</div>

				<div className="field">
					<label>Page URL</label>
					<div className="preview">{pageUrl || '(none — click Refresh page context)'}</div>
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
