'use client';

import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'crisp-theme';

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
	if (preference === 'system') {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return preference;
}

export function applyTheme(preference: ThemePreference) {
	const resolved = resolveTheme(preference);
	document.documentElement.dataset.theme = resolved;
	document.documentElement.dataset.themePreference = preference;
	document.documentElement.style.colorScheme = resolved;
	localStorage.setItem(KEY, preference);
}

export function ThemeControl() {
	const [preference, setPreference] = useState<ThemePreference>('system');

	useEffect(() => {
		const stored = localStorage.getItem(KEY);
		const next: ThemePreference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
		setPreference(next);
		applyTheme(next);
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => {
			if ((localStorage.getItem(KEY) ?? 'system') === 'system') applyTheme('system');
		};
		media.addEventListener('change', onChange);
		return () => media.removeEventListener('change', onChange);
	}, []);

	return (
		<div className="px-2 py-2" role="group" aria-label="Theme">
			<p className="px-1 pb-1 text-xs text-text-dim">Theme</p>
			<div className="grid grid-cols-3 gap-1">
				{(['light', 'dark', 'system'] as const).map((option) => (
					<button
						key={option}
						type="button"
						className={preference === option ? 'btn-primary px-2 py-1 text-xs capitalize' : 'btn px-2 py-1 text-xs capitalize'}
						aria-pressed={preference === option}
						onClick={() => {
							setPreference(option);
							applyTheme(option);
						}}
					>
						{option}
					</button>
				))}
			</div>
		</div>
	);
}
