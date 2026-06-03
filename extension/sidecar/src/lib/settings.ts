export type SidecarSettings = {
	apiBaseUrl: string;
	apiToken: string;
};

const DEFAULTS: SidecarSettings = {
	apiBaseUrl: 'http://localhost:3000',
	apiToken: '',
};

export async function loadSettings(): Promise<SidecarSettings> {
	const stored = await chrome.storage.local.get(['apiBaseUrl', 'apiToken']);
	return {
		apiBaseUrl: (stored.apiBaseUrl as string) || DEFAULTS.apiBaseUrl,
		apiToken: (stored.apiToken as string) || DEFAULTS.apiToken,
	};
}

export async function saveSettings(settings: SidecarSettings): Promise<void> {
	await chrome.storage.local.set(settings);
}
