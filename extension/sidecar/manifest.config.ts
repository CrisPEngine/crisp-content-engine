import { defineManifest } from '@crxjs/vite-plugin';

/** Host permissions for executeScript on supported reply platforms (not CCE). */
const PLATFORM_HOST_PERMISSIONS = [
	'https://x.com/*',
	'https://twitter.com/*',
	'https://www.linkedin.com/*',
	'https://linkedin.com/*',
	'https://www.reddit.com/*',
	'https://reddit.com/*',
	'https://www.facebook.com/*',
	'https://facebook.com/*',
	'https://www.instagram.com/*',
	'https://instagram.com/*',
	'https://www.youtube.com/*',
	'https://youtube.com/*',
	'https://youtu.be/*',
	'https://bsky.app/*',
	'https://threads.net/*',
] as const;

export default defineManifest({
	manifest_version: 3,
	name: 'CRISP Sidecar',
	version: '0.1.0',
	description: 'Draft replies in brand voice. Manual copy only — no auto-posting.',
	permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'tabs'],
	host_permissions: [
		'http://localhost:3000/*',
		'http://127.0.0.1:3000/*',
		'https://app.crispdigital.io/*',
		...PLATFORM_HOST_PERMISSIONS,
	],
	icons: {
		16: 'public/icons/icon-16.png',
		32: 'public/icons/icon-32.png',
		48: 'public/icons/icon-48.png',
		128: 'public/icons/icon-128.png',
	},
	action: {
		default_title: 'CRISP Sidecar',
		default_icon: {
			16: 'public/icons/icon-16.png',
			32: 'public/icons/icon-32.png',
			48: 'public/icons/icon-48.png',
		},
	},
	side_panel: {
		default_path: 'sidepanel.html',
	},
	background: {
		service_worker: 'src/background.ts',
		type: 'module',
	},
});
