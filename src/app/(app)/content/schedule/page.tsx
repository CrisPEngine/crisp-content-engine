'use client';

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Calendar, Clock, CheckCircle, XCircle, Plus, List, Grid3X3 } from 'lucide-react';
import { Skeleton, ContentItemSkeleton } from '@/components/skeletons/Skeleton';

const ScheduleCalendarView = lazy(() => import('@/components/ScheduleCalendarView'));

type ScheduledContent = {
	id: string;
	title: string;
	platform: string;
	scheduled_date: string;
	status: string;
	brand_name: string;
	content_preview: string;
};

export default function SchedulingDashboard() {
	const supabase = useSupabase();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [scheduledContent, setScheduledContent] = useState<ScheduledContent[]>([]);
	const [filter, setFilter] = useState<'all' | 'scheduled' | 'published' | 'failed'>('all');
	const [selectedDate, setSelectedDate] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

	function formatScheduledDateTime(dateString: string | null | undefined): string {
		if (!dateString) return 'Not scheduled';
		try {
			const date = new Date(dateString);
			return date.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			});
		} catch {
			return 'Invalid date';
		}
	}

	function formatCountdown(dateString: string | null | undefined): string | null {
		if (!dateString) return null;
		try {
			const date = new Date(dateString);
			const now = new Date();
			const diffMs = date.getTime() - now.getTime();
			const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
			const diffDays = Math.floor(diffHours / 24);

			if (diffMs < 0) {
				return 'Past due';
			}

			// Only show countdown for items within 5 days
			if (diffDays >= 5) {
				return null;
			}

			if (diffHours < 1) {
				return 'Within 1 hour';
			}
			if (diffHours < 24) {
				return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
			}
			return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
		} catch {
			return null;
		}
	}

	useEffect(() => {
		if (!supabase) return;
		loadScheduledContent();
	}, [supabase, filter, selectedDate]);

	async function loadScheduledContent() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const {
				data: { user },
				error: userErr,
			} = await supabase.auth.getUser();
			if (userErr || !user) {
				router.push('/sign-in');
				return;
			}

			const res = await fetch('/api/content/queue?stage=schedule', { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load schedule');
			}
			const data = await res.json();
			const items: ScheduledContent[] = (data.items || []).map((item: any) => ({
				id: item.id,
				title: item.title,
				platform: item.platform,
				scheduled_date: item.scheduled_date,
				status: item.status,
				brand_name: item.brand_name,
				content_preview: item.summary || item.content || '',
			}));
			setScheduledContent(items);
		} catch (err: any) {
			console.error('Failed to load scheduled content:', err);
			setError(err.message || 'Failed to load schedule');
		} finally {
			setLoading(false);
		}
	}

	const filteredContent = useMemo(() => {
		return scheduledContent.filter((item) => {
			const matchesStatus =
				filter === 'all'
					? true
					: filter === 'scheduled'
					? item.status === 'Scheduled' || item.status === 'Ready To Publish'
					: filter === 'published'
					? item.status === 'Published'
					: item.status === 'Failed';

			if (!matchesStatus) return false;

			if (!selectedDate) return true;
			if (!item.scheduled_date) return false;
			const scheduledISO = new Date(item.scheduled_date).toISOString().split('T')[0];
			return scheduledISO === selectedDate;
		});
	}, [scheduledContent, filter, selectedDate]);

	const handleReschedule = useCallback(async (contentId: string, newDate: string): Promise<boolean> => {
		try {
			const res = await fetch(`/api/content/queue/${contentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scheduled_time: newDate }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data?.error || 'Failed to reschedule');
				return false;
			}
			setScheduledContent((prev) =>
				prev.map((item) =>
					item.id === contentId ? { ...item, scheduled_date: newDate } : item
				)
			);
			return true;
		} catch {
			setError('Failed to reschedule');
			return false;
		}
	}, []);

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'Scheduled':
			case 'Ready To Publish':
				return <Clock className="w-4 h-4 text-primary" />;
			case 'Published':
				return <CheckCircle className="w-4 h-4 text-accent" />;
			case 'Failed':
				return <XCircle className="w-4 h-4 text-danger" />;
			default:
				return <Clock className="w-4 h-4 text-text-dim" />;
		}
	};

	if (loading) {
		return (
			<div className="mx-auto max-w-6xl space-y-4">
				<div className="mb-6">
					<Skeleton height="20px" width="80px" />
				</div>
				<div className="mb-6 space-y-3">
					<div className="flex items-center justify-between">
						<div className="space-y-2">
							<Skeleton height="32px" width="250px" />
							<Skeleton height="16px" width="300px" />
						</div>
						<Skeleton height="40px" width="140px" className="rounded-xl2" />
					</div>
					<div className="flex gap-3">
						<Skeleton height="36px" width="60px" className="rounded-xl2" />
						<Skeleton height="36px" width="100px" className="rounded-xl2" />
						<Skeleton height="36px" width="100px" className="rounded-xl2" />
						<Skeleton height="36px" width="80px" className="rounded-xl2" />
						<Skeleton height="36px" width="150px" className="rounded-xl2" />
					</div>
				</div>
				{Array.from({ length: 3 }).map((_, i) => (
					<ContentItemSkeleton key={i} />
				))}
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl">
			<div className="mb-6">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>

			<div className="mb-6 space-y-3">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h1 className="text-3xl font-semibold mb-2">Scheduling Dashboard</h1>
						<p className="text-text-dim">
							View and manage your scheduled content
						</p>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex rounded-xl2 border border-edge/60 overflow-hidden">
							<button
								onClick={() => setViewMode('list')}
								className={`px-3 py-2 flex items-center gap-1.5 text-sm transition ${
									viewMode === 'list'
										? 'bg-primary/15 text-primary'
										: 'bg-surface/30 text-text-dim hover:text-text'
								}`}
							>
								<List className="w-4 h-4" />
								List
							</button>
							<button
								onClick={() => setViewMode('calendar')}
								className={`px-3 py-2 flex items-center gap-1.5 text-sm transition ${
									viewMode === 'calendar'
										? 'bg-primary/15 text-primary'
										: 'bg-surface/30 text-text-dim hover:text-text'
								}`}
							>
								<Grid3X3 className="w-4 h-4" />
								Calendar
							</button>
						</div>
						<button
							onClick={() => router.push('/content/create')}
							className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2"
						>
							<Plus className="w-4 h-4" />
							Create Content
						</button>
					</div>
				</div>

				{error && (
					<div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-xl2 p-3 flex items-center justify-between">
						<span>{error}</span>
						<button onClick={() => setError(null)} className="text-danger/60 hover:text-danger ml-2">✕</button>
					</div>
				)}

				{viewMode === 'list' && (
					<div className="flex gap-3 flex-wrap">
						<button
							onClick={() => setFilter('all')}
							className={`px-4 py-2 rounded-xl2 border text-sm transition ${
								filter === 'all'
									? 'border-primary/40 bg-primary/10 text-primary'
									: 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'
							}`}
						>
							All
						</button>
						<button
							onClick={() => setFilter('scheduled')}
							className={`px-4 py-2 rounded-xl2 border text-sm transition ${
								filter === 'scheduled'
									? 'border-primary/40 bg-primary/10 text-primary'
									: 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'
							}`}
						>
							Scheduled
						</button>
						<button
							onClick={() => setFilter('published')}
							className={`px-4 py-2 rounded-xl2 border text-sm transition ${
								filter === 'published'
									? 'border-primary/40 bg-primary/10 text-primary'
									: 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'
							}`}
						>
							Published
						</button>
						<button
							onClick={() => setFilter('failed')}
							className={`px-4 py-2 rounded-xl2 border text-sm transition ${
								filter === 'failed'
									? 'border-primary/40 bg-primary/10 text-primary'
									: 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'
							}`}
						>
							Failed
						</button>
						<input
							type="date"
							value={selectedDate}
							onChange={(e) => setSelectedDate(e.target.value)}
							className="px-4 py-2 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
						/>
					</div>
				)}
			</div>

			{viewMode === 'calendar' ? (
				<Suspense fallback={<div className="card p-8 text-center text-text-dim">Loading calendar...</div>}>
					<ScheduleCalendarView items={scheduledContent} onReschedule={handleReschedule} />
				</Suspense>
		) : filteredContent.length === 0 ? (
			<div className="card p-10 text-center flex flex-col items-center gap-4">
				<div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
					<Calendar className="w-6 h-6 text-primary/50" />
				</div>
				<div>
					<p className="font-semibold text-text mb-1">Nothing scheduled yet</p>
					<p className="text-sm text-text-dim max-w-sm mx-auto">Approved content will appear here once scheduled. Review and approve your drafts to get posts on the calendar.</p>
				</div>
				<div className="flex flex-wrap gap-3 justify-center">
					<a
						href="/content/approval"
						className="px-4 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-sm transition-colors"
					>
						Review Drafts
					</a>
					<a
						href="/content/idea-engine"
						className="px-4 py-2 rounded-xl2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-medium text-sm transition-colors"
					>
						💡 Idea Engine
					</a>
				</div>
			</div>
			) : (
				<div className="space-y-4">
					{filteredContent.map((item) => (
						<motion.div
							key={item.id}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							className="card p-6"
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										{getStatusIcon(item.status)}
										<h3 className="text-lg font-semibold">{item.title}</h3>
										<span className="px-2 py-1 rounded-full text-xs bg-primary/15 border border-primary/30 text-primary">
											{item.platform}
										</span>
										<span className={`px-2 py-1 rounded-full text-xs border ${
											item.status === 'Scheduled' || item.status === 'Ready To Publish'
												? 'bg-primary/15 border-primary/30 text-primary'
												: item.status === 'Published'
												? 'bg-accent/15 border-accent/30 text-accent'
												: 'bg-danger/15 border-danger/30 text-danger'
										}`}>
											{item.status}
										</span>
									</div>
									<p className="text-sm text-text-dim mb-2">
										Brand: {item.brand_name}
									</p>
									<div className="flex items-center gap-2 text-sm text-text-dim mb-2 flex-wrap">
										<Calendar className="w-4 h-4" />
										<span>{formatScheduledDateTime(item.scheduled_date)}</span>
										{formatCountdown(item.scheduled_date) && (
											<span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 border border-primary/30 text-primary">
												{formatCountdown(item.scheduled_date)}
											</span>
										)}
									</div>
									<p className="text-sm text-text-soft line-clamp-2">
										{item.content_preview}
									</p>
								</div>
							</div>
						</motion.div>
					))}
				</div>
			)}
		</div>
	);
}

