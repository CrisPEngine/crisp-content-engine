'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Calendar, Clock, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react';

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
	const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

	useEffect(() => {
		if (!supabase) return;
		loadScheduledContent();
	}, [supabase, filter, selectedDate]);

	async function loadScheduledContent() {
		if (!supabase) return;
		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/login');
				return;
			}

			// TODO: Replace with actual API call
			// const res = await fetch(`/api/content/schedule?filter=${filter}&date=${selectedDate}`);
			// const data = await res.json();
			// setScheduledContent(data.items);

			// Placeholder data
			setScheduledContent([
				{
					id: '1',
					title: 'LinkedIn Post - Product Launch',
					platform: 'LinkedIn',
					scheduled_date: '2025-01-15T10:00:00Z',
					status: 'Scheduled',
					brand_name: 'Example Brand',
					content_preview: 'Excited to announce our new product...',
				},
				{
					id: '2',
					title: 'Twitter Post - Industry News',
					platform: 'X',
					scheduled_date: '2025-01-16T14:00:00Z',
					status: 'Published',
					brand_name: 'Example Brand',
					content_preview: 'Breaking news in our industry...',
				},
			]);
		} catch (error) {
			console.error('Failed to load scheduled content:', error);
		} finally {
			setLoading(false);
		}
	}

	const filteredContent = scheduledContent.filter((item) => {
		if (filter === 'all') return true;
		if (filter === 'scheduled') return item.status === 'Scheduled';
		if (filter === 'published') return item.status === 'Published';
		if (filter === 'failed') return item.status === 'Failed';
		return true;
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'Scheduled':
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
			<div className="mx-auto max-w-6xl">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading schedule...</p>
				</div>
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

			<div className="mb-6">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h1 className="text-3xl font-semibold mb-2">Scheduling Dashboard</h1>
						<p className="text-text-dim">
							View and manage your scheduled content
						</p>
					</div>
					<button
						onClick={() => router.push('/content/create')}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2"
					>
						<Plus className="w-4 h-4" />
						Create Content
					</button>
				</div>

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
			</div>

			{filteredContent.length === 0 ? (
				<div className="card p-8 text-center">
					<Calendar className="w-12 h-12 text-text-dim mx-auto mb-4" />
					<p className="text-text-soft">No content scheduled for this period</p>
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
											item.status === 'Scheduled'
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
									<div className="flex items-center gap-2 text-sm text-text-dim mb-2">
										<Calendar className="w-4 h-4" />
										<span>
											{new Date(item.scheduled_date).toLocaleString()}
										</span>
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

