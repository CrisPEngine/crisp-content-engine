'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/FileUpload';
import { Loader2, Calendar, Target, ClipboardList } from 'lucide-react';

type BrandProfile = {
	id: string;
	client_name: string;
	status: string;
};

type FormState = {
	brand_profile_id: string;
	monthly_cycle_start: string;
	objective: string;
	themes_focus: string;
	key_dates: string;
	feedback_notes: string;
	content_preferences: string;
	attachments: string[];
};

const initialFormState = (): FormState => {
	const today = new Date();
	const iso = today.toISOString().split('T')[0];
	return {
		brand_profile_id: '',
		monthly_cycle_start: iso,
		objective: '',
		themes_focus: '',
		key_dates: '',
		feedback_notes: '',
		content_preferences: '',
		attachments: [],
	};
};

export default function MonthlyUpdatePage() {
	const router = useRouter();
	const [profiles, setProfiles] = useState<BrandProfile[]>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [form, setForm] = useState<FormState>(() => initialFormState());
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		const fetchProfiles = async () => {
			try {
				const res = await fetch('/api/brands', { cache: 'no-store' });
				if (!res.ok) {
					throw new Error('Failed to load brand profiles');
				}
				const data = await res.json();
				setProfiles(data.profiles || []);
			} catch (err: any) {
				console.error(err);
				setError(err.message || 'Unable to load brand profiles');
			} finally {
				setLoading(false);
			}
		};

		fetchProfiles();
	}, []);

	const selectedProfile = useMemo(
		() => profiles.find((profile) => profile.id === form.brand_profile_id) || null,
		[profiles, form.brand_profile_id]
	);

	const updateField = (field: keyof FormState, value: string | string[]) => {
		setForm((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const resetForm = () => {
		setForm(initialFormState());
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);
		setSuccess(null);

		if (!form.brand_profile_id) {
			setError('Please select a brand profile to update.');
			return;
		}

		if (!form.objective.trim()) {
			setError('Please add a clear objective for this cycle.');
			return;
		}

		if (!form.themes_focus.trim()) {
			setError('Share the themes or campaigns you want us to focus on.');
			return;
		}

		setSubmitting(true);
		try {
			const res = await fetch('/api/strategy/monthly-update', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(form),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to submit monthly update');
			}

			setSuccess('Monthly strategy update submitted. We will email you when the new plan is ready.');
			resetForm();
		} catch (err: any) {
			console.error('Monthly update error:', err);
			setError(err.message || 'Something went wrong while submitting your update.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="mx-auto max-w-3xl">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading your brand profiles...</p>
				</div>
			</div>
		);
	}

	if (!profiles.length) {
		return (
			<div className="mx-auto max-w-3xl space-y-4">
				<div className="card p-8 text-center space-y-3">
					<p className="text-text-soft text-sm">
						You don’t have any brand profiles yet. Complete onboarding first to generate your initial strategy.
					</p>
					<button
						onClick={() => router.push('/onboarding')}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20"
					>
						Go to Onboarding
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<header className="space-y-2">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
				<h1 className="text-3xl font-semibold">Monthly Strategy Update</h1>
				<p className="text-text-dim text-sm">
					Share what’s new for the coming month so we can evolve your content plan without repeating ideas.
				</p>
			</header>

			<form onSubmit={handleSubmit} className="card p-8 space-y-6">
				<div className="grid gap-5">
					<div className="space-y-2">
						<label className="block text-sm font-medium">Brand profile *</label>
						<select
							value={form.brand_profile_id}
							onChange={(e) => updateField('brand_profile_id', e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
						>
							<option value="">Select brand…</option>
							{profiles.map((profile) => (
								<option key={profile.id} value={profile.id}>
									{profile.client_name} · {profile.status}
								</option>
							))}
						</select>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<label className="block text-sm font-medium">Cycle start date *</label>
							<input
								type="date"
								value={form.monthly_cycle_start}
								onChange={(e) => updateField('monthly_cycle_start', e.target.value)}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							/>
						</div>
						<div className="text-sm text-text-dim bg-surface/30 border border-edge/60 rounded-xl2 p-4 flex items-start gap-3">
							<Calendar className="w-4 h-4 mt-0.5 text-primary" />
							<span>
								Pick the date you’d like the new schedule to start from. We’ll use this for reporting and cadence.
							</span>
						</div>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Objective *</label>
						<textarea
							rows={4}
							value={form.objective}
							onChange={(e) => updateField('objective', e.target.value)}
							placeholder="e.g. Promote our new AI feature launch, grow waitlist by 500 leads, nurture audience ahead of conference."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Priority themes & campaigns *</label>
						<textarea
							rows={4}
							value={form.themes_focus}
							onChange={(e) => updateField('themes_focus', e.target.value)}
							placeholder="List topics we should emphasise this month. Bullet points are perfect."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<label className="block text-sm font-medium">Key launches or dates</label>
							<textarea
								rows={3}
								value={form.key_dates}
								onChange={(e) => updateField('key_dates', e.target.value)}
								placeholder="Product drops, events, campaigns, newsletter dates, etc."
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							/>
						</div>
						<div className="space-y-2">
							<label className="block text-sm font-medium">Feedback or notes</label>
							<textarea
								rows={3}
								value={form.feedback_notes}
								onChange={(e) => updateField('feedback_notes', e.target.value)}
								placeholder="What worked last month? Anything to avoid or double down on?"
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Content preferences</label>
						<textarea
							rows={3}
							value={form.content_preferences}
							onChange={(e) => updateField('content_preferences', e.target.value)}
							placeholder="Call-to-action focus, time of day, formats, tone adjustments, etc."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					<div className="space-y-2">
						<label className="block text-sm font-medium">Supporting files (optional)</label>
						<FileUpload onUpload={(urls) => updateField('attachments', urls)} maxFiles={6} maxSizeMB={20} />
						<p className="text-xs text-text-dim flex items-center gap-2">
							<ClipboardList className="w-3 h-3" />
							Upload campaign decks, messaging docs, creative inspiration, or anything else that helps.
						</p>
					</div>
				</div>

				{selectedProfile && (
					<div className="rounded-xl2 border border-primary/30 bg-primary/5 p-4 text-sm text-text-soft flex items-start gap-3">
						<Target className="w-4 h-4 text-primary mt-0.5" />
						<div>
							<p className="font-medium text-text">{selectedProfile.client_name}</p>
							<p className="text-xs text-text-dim mt-1">
								We’ll keep the core brand profile and approved strategy intact—this update only adds fresh direction for the
								coming month.
							</p>
						</div>
					</div>
				)}

				{error && (
					<div className="border border-danger/40 bg-danger/10 text-danger text-sm rounded-xl2 p-4">
						{error}
					</div>
				)}

				{success && (
					<div className="border border-accent/40 bg-accent/10 text-accent text-sm rounded-xl2 p-4">
						{success}
					</div>
				)}

				<div className="flex items-center justify-between pt-4 border-t border-edge/60">
					<button
						type="button"
						onClick={resetForm}
						disabled={submitting}
						className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm disabled:opacity-40"
					>
						Clear form
					</button>
					<button
						type="submit"
						disabled={submitting}
						className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 disabled:opacity-50"
					>
						{submitting && <Loader2 className="w-4 h-4 animate-spin" />}
						<span>{submitting ? 'Sending update...' : 'Submit monthly direction'}</span>
					</button>
				</div>
			</form>
		</div>
	);
}
