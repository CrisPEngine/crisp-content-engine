import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
	manifest_version: 3,
	name: 'CRISP Sidecar',
	version: '0.1.0',
	description: 'Draft replies in brand voice. Manual copy only — no auto-posting.',
	permissions: ['storage', 'sidePanel', 'activeTab', 'scripting'],
	host_permissions: [
		'http://localhost:3000/*',
		'http://127.0.0.1:3000/*',
		'https://app.crispdigital.io/*',
	],
	action: {
		default_title: 'CRISP Sidecar',
	},
	side_panel: {
		default_path: 'sidepanel.html',
	},
	background: {
		service_worker: 'src/background.ts',
		type: 'module',
	},
});
