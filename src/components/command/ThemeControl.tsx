'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

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

	const options = [
		{ id: 'light' as const, label: 'Light', icon: Sun },
		{ id: 'dark' as const, label: 'Dark', icon: Moon },
		{ id: 'system' as const, label: 'System', icon: Monitor },
	];

	return (
		<div className="px-2 py-2" role="group" aria-label="Appearance">
			<p className="px-1 pb-1 text-xs font-medium text-text-dim">Appearance</p>
			<div className="grid grid-cols-3 gap-1">
				{options.map((option) => {
					const selected = preference === option.id;
					const Icon = option.icon;
					return (
						<button
							key={option.id}
							type="button"
							className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium ${selected ? 'bg-primary text-[var(--on-primary)]' : 'border border-edge bg-surface text-text hover:bg-surface-hover'}`}
							aria-pressed={selected}
							onClick={() => {
								setPreference(option.id);
								applyTheme(option.id);
							}}
						>
							<Icon className="h-3.5 w-3.5" aria-hidden="true" />
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
