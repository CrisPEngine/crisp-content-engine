export type SidecarSettings = {
	apiBaseUrl: string;
	apiToken: string;
};

export const DEFAULT_SETTINGS: SidecarSettings = {
	apiBaseUrl: 'http://localhost:3000',
	apiToken: '',
};

export function isSettingsComplete(settings: SidecarSettings): boolean {
	const url = settings.apiBaseUrl?.trim();
	const token = settings.apiToken?.trim();
	return Boolean(url && token);
}

export async function loadSettings(): Promise<SidecarSettings> {
	const stored = await chrome.storage.local.get(['apiBaseUrl', 'apiToken']);
	return {
		apiBaseUrl: (stored.apiBaseUrl as string) || DEFAULT_SETTINGS.apiBaseUrl,
		apiToken: (stored.apiToken as string) || DEFAULT_SETTINGS.apiToken,
	};
}

export async function saveSettings(settings: SidecarSettings): Promise<void> {
	await chrome.storage.local.set({
		apiBaseUrl: settings.apiBaseUrl.trim(),
		apiToken: settings.apiToken.trim(),
	});
}
