import { useState } from 'react';
import type { ConnectionTestResult } from '../lib/api';
import { formatApiErrorForUi, SidecarApiError } from '../lib/errors';
import { testConnection } from '../lib/api';
import { isSettingsComplete, saveSettings, type SidecarSettings } from '../lib/settings';

type Props = {
	settings: SidecarSettings;
	onChange: (settings: SidecarSettings) => void;
	onSaved: (settings: SidecarSettings) => void;
	onConnected: (result: ConnectionTestResult) => void;
	variant?: 'setup' | 'inline';
	onClose?: () => void;
};

export function SettingsPanel({
	settings,
	onChange,
	onSaved,
	onConnected,
	variant = 'inline',
	onClose,
}: Props) {
	const [loading, setLoading] = useState(false);
	const [testMessage, setTestMessage] = useState<string | null>(null);
	const [testError, setTestError] = useState<string | null>(null);

	const handleSave = async () => {
		setTestMessage(null);
		setTestError(null);
		await saveSettings(settings);
		onSaved(settings);
		setTestMessage('Settings saved.');
	};

	const handleTest = async () => {
		setLoading(true);
		setTestMessage(null);
		setTestError(null);
		try {
			if (!isSettingsComplete(settings)) {
				setTestError('Enter both CCE API URL and Bearer token.');
				return;
			}
			const result = await testConnection(settings);
			await saveSettings(settings);
			onSaved(settings);

			const brandLine =
				result.brands.length > 0
					? `${result.brands.length} brand(s) loaded`
					: result.brandsMeta.emptyReason || '0 brands returned';

			setTestMessage(`Connected · Sidecar v${result.config.version} · ${brandLine}`);
			onConnected(result);
		} catch (error) {
			const apiError =
				error instanceof SidecarApiError
					? error
					: new SidecarApiError(error instanceof Error ? error.message : 'Test failed', {
							kind: 'unknown',
						});
			setTestError(formatApiErrorForUi(apiError));
		} finally {
			setLoading(false);
		}
	};

	const isSetup = variant === 'setup';

	return (
		<section className={`settings-panel ${isSetup ? 'settings-panel--setup' : ''}`}>
			{isSetup ? (
				<>
					<h2 className="setup-title">Set up CRISP Sidecar</h2>
					<p className="setup-lead">
						Connect to your CCE API before drafting. Nothing is sent until you click Generate or Save.
					</p>
				</>
			) : (
				<h2 className="settings-heading">Settings</h2>
			)}

			<div className="field">
				<label htmlFor="apiBaseUrl">CCE API URL</label>
				<input
					id="apiBaseUrl"
					type="url"
					autoComplete="off"
					placeholder="http://localhost:3000"
					value={settings.apiBaseUrl}
					onChange={(e) => onChange({ ...settings, apiBaseUrl: e.target.value })}
				/>
			</div>
			<div className="field">
				<label htmlFor="apiToken">Bearer token</label>
				<input
					id="apiToken"
					type="password"
					autoComplete="off"
					placeholder="SIDECAR_API_SECRET from server .env"
					value={settings.apiToken}
					onChange={(e) => onChange({ ...settings, apiToken: e.target.value })}
				/>
			</div>

			<div className="actions actions--stack">
				<button type="button" className="btn btn-primary" onClick={() => void handleSave()}>
					Save
				</button>
				<button
					type="button"
					className="btn btn-secondary"
					disabled={loading}
					onClick={() => void handleTest()}
				>
					{loading ? 'Testing…' : 'Test connection'}
				</button>
				{!isSetup && onClose && (
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						Close
					</button>
				)}
			</div>

			{testMessage && <div className="banner banner-success">{testMessage}</div>}
			{testError && <div className="banner banner-error">{testError}</div>}

			{isSetup && (
				<p className="setup-hint">
					Tip: On the server set <code>SIDECAR_API_ENABLED=true</code> and use the same value for{' '}
					<code>SIDECAR_API_SECRET</code> as your Bearer token.
				</p>
			)}
		</section>
	);
}
