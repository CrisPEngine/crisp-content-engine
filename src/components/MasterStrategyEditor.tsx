'use client';

/**
 * Master Strategy Editor Component
 * 
 * Allows users to edit their master strategy JSON with auto-save
 * Auto-saves to BrandProfiles.strategy_json with debounced PATCH (800ms)
 */

import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { Edit, Save, Loader2, Check } from 'lucide-react';

type MasterStrategyEditorProps = {
	brandProfileId: string;
	initialStrategyJson: any;
};

export function MasterStrategyEditor({ brandProfileId, initialStrategyJson }: MasterStrategyEditorProps) {
	const supabase = useSupabase();
	const [strategyJson, setStrategyJson] = useState<string>('');
	const [saving, setSaving] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [hasChanges, setHasChanges] = useState(false);
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Initialize with current strategy JSON
	useEffect(() => {
		if (initialStrategyJson) {
			const jsonString = typeof initialStrategyJson === 'string'
				? initialStrategyJson
				: JSON.stringify(initialStrategyJson, null, 2);
			setStrategyJson(jsonString);
		}
	}, [initialStrategyJson]);

	// Auto-save with debounce
	useEffect(() => {
		if (!hasChanges || !strategyJson) return;

		// Clear existing timeout
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		// Set new timeout
		saveTimeoutRef.current = setTimeout(() => {
			saveStrategy();
		}, 800); // 800ms debounce

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, [strategyJson, hasChanges]);

	const handleChange = (value: string) => {
		setStrategyJson(value);
		setHasChanges(true);
		setError(null);
	};

	const saveStrategy = async () => {
		if (!supabase || !brandProfileId) return;

		// Validate JSON
		let parsedJson: any;
		try {
			parsedJson = JSON.parse(strategyJson);
		} catch (err) {
			setError('Invalid JSON format. Please check your syntax.');
			return;
		}

		setSaving(true);
		setError(null);

		try {
			const res = await fetch(`/api/strategy/${brandProfileId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					strategy_json: parsedJson,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save strategy');
			}

			setLastSaved(new Date());
			setHasChanges(false);
		} catch (err: any) {
			console.error('Failed to save strategy:', err);
			setError(err.message || 'Failed to save strategy');
		} finally {
			setSaving(false);
		}
	};

	const formatLastSaved = () => {
		if (!lastSaved) return null;
		const now = new Date();
		const diff = now.getTime() - lastSaved.getTime();
		const seconds = Math.floor(diff / 1000);
		
		if (seconds < 60) return 'Just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return lastSaved.toLocaleDateString();
	};

	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Edit className="w-5 h-5 text-primary" />
					<h2 className="text-xl font-semibold">Master Strategy</h2>
				</div>
				<div className="flex items-center gap-3">
					{saving && (
						<div className="flex items-center gap-2 text-sm text-text-dim">
							<Loader2 className="w-4 h-4 animate-spin" />
							Saving...
						</div>
					)}
					{!saving && lastSaved && !hasChanges && (
						<div className="flex items-center gap-2 text-sm text-accent">
							<Check className="w-4 h-4" />
							Saved {formatLastSaved()}
						</div>
					)}
					{hasChanges && !saving && (
						<button
							onClick={saveStrategy}
							className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
						>
							<Save className="w-4 h-4" />
							Save Now
						</button>
					)}
				</div>
			</div>

			{error && (
				<div className="p-3 rounded-xl2 border border-danger/40 bg-danger/10 text-sm text-danger mb-4">
					{error}
				</div>
			)}

			<div className="text-sm text-text-dim mb-4">
				Edit your master strategy JSON. Changes are auto-saved after 800ms of inactivity.
			</div>

			<textarea
				value={strategyJson}
				onChange={(e) => handleChange(e.target.value)}
				rows={20}
				className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text font-mono text-xs focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
				placeholder='{"pillars": [...], "voice": {...}, ...}'
			/>
		</div>
	);
}
