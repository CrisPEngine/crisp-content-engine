'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Eye, Calendar, Loader2, Edit2, Save, Clock, Upload, Image as ImageIcon, Copy } from 'lucide-react';
import { Skeleton, ContentItemSkeleton } from '@/components/skeletons/Skeleton';

type ContentItem = {
	id: string;
	title: string;
	platform: string;
	content: string;
	status: string;
	content_type?: string;
	scheduled_date?: string | null;
	published_at?: string | null;
	created_time: string;
	brand_name: string;
	summary?: string;
	call_to_action?: string;
	hashtags?: string;
	image_prompt?: string;
	image_generation_source?: string;
	image_reference_url?: string;
	image_cloudinary_id?: string;
	// Multi-channel fields
	post_type?: string;
	thread_group_id?: string | null;
	thread_index?: number | null;
	character_count?: number | null;
	visual_brief?: string | null;
	generation_job_id?: string | null;
	content_item_key?: string | null;
};

type ChannelTab = 'LinkedIn' | 'X' | 'Meta' | 'Blog';

type BrandOption = {
	id: string;
	client_name: string;
};

export default function ContentApprovalPage() {
	const supabase = useSupabase();
	const router = useRouter();
	const searchParams = useSearchParams();
	const [loading, setLoading] = useState(true);
	const [contentItems, setContentItems] = useState<ContentItem[]>([]);
	const [brands, setBrands] = useState<BrandOption[]>([]);
	const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
	const [selectedTab, setSelectedTab] = useState<ChannelTab>('LinkedIn');
	const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
	const [editingItem, setEditingItem] = useState<string | null>(null);
	const [editingTitle, setEditingTitle] = useState<string>('');
	const [editingContent, setEditingContent] = useState<string>('');
	const [editingHashtags, setEditingHashtags] = useState<string>('');
	const [editingImagePrompt, setEditingImagePrompt] = useState<string>('');
	const [editingScheduledTimeId, setEditingScheduledTimeId] = useState<string | null>(null);
	const [editingScheduledTime, setEditingScheduledTime] = useState<string>('');
	const [approving, setApproving] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [saving, setSaving] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [bulkApproving, setBulkApproving] = useState(false);
	const [uploadingImage, setUploadingImage] = useState<string | null>(null);
	const [imageUploadError, setImageUploadError] = useState<Record<string, string>>({});
	const [imageUploadSuccess, setImageUploadSuccess] = useState<Record<string, boolean>>({});
	const [copySuccess, setCopySuccess] = useState<Record<string, boolean>>({});
	const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);
	const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	const hasInitializedBrand = useRef(false); // Track if we've set initial brand from URL

	// Load brands on mount
	useEffect(() => {
		if (!supabase) return;
		loadBrands();
	}, [supabase]);

	// Load content when brand or tab changes
	useEffect(() => {
		if (!supabase) return;
		loadContent();
		loadQuota();
	}, [supabase, selectedTab, selectedBrandId]); // Reload when tab or brand changes

	// Set initial brand from URL param (only once when brands first load)
	useEffect(() => {
		if (brands.length === 0 || hasInitializedBrand.current) return;
		
		const brandParam = searchParams.get('brand_profile_id');
		if (brandParam && brands.some((b) => b.id === brandParam)) {
			setSelectedBrandId(brandParam);
		}
		hasInitializedBrand.current = true; // Mark as initialized
		// After this runs once, manual selections won't be overridden
	}, [searchParams, brands]);

	// Poll for content if generating
	useEffect(() => {
		if (!isGenerating || !supabase) return;
		
		const pollInterval = setInterval(() => {
			loadContent();
		}, 5000); // Poll every 5 seconds

		return () => clearInterval(pollInterval);
	}, [isGenerating, supabase]);

	async function loadBrands() {
		try {
			const res = await fetch('/api/brands', { cache: 'no-store' });
			if (!res.ok) throw new Error('Failed to load brands');
			const data = await res.json();
			const profiles = (data.profiles || []).map((p: any) => ({
				id: p.id,
				client_name: p.client_name || 'Unknown Brand',
			}));
			setBrands(profiles);
		} catch (err: any) {
			console.error(err);
		}
	}

	async function loadQuota() {
		try {
			const res = await fetch('/api/content/quota', { cache: 'no-store' });
			if (res.ok) {
				const data = await res.json();
				setQuotaRemaining(data.posts_remaining || 0);
			}
		} catch (err) {
			console.error('Failed to load quota:', err);
		}
	}

	async function loadContent() {
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

			const contentBriefId = searchParams.get('content_brief_id');
			
			let apiUrl = '/api/content/queue?stage=approval';
			
			// Add platform filter based on selected tab
			apiUrl += `&platform=${encodeURIComponent(selectedTab)}`;
			
			// Add brand filter if not "all"
			if (selectedBrandId && selectedBrandId !== 'all') {
				apiUrl += `&brand_profile_id=${encodeURIComponent(selectedBrandId)}`;
			}
			if (contentBriefId) {
				apiUrl += `&content_brief_id=${encodeURIComponent(contentBriefId)}`;
			}
			
			const res = await fetch(apiUrl, { 
				cache: 'no-store',
				credentials: 'include', // Include cookies for authentication
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load content queue');
			}
			const data = await res.json();
			const items = Array.isArray(data.items) ? data.items : [];
			setContentItems(items);
			
			// If no items and we just approved a strategy, show loading state
			if (items.length === 0) {
				const urlParams = new URLSearchParams(window.location.search);
				if (urlParams.get('generating') === 'true') {
					setIsGenerating(true);
				}
			} else {
				setIsGenerating(false);
			}
		} catch (err: any) {
			console.error('Failed to load content:', err);
			setError(err.message || 'Failed to load content');
		} finally {
			setLoading(false);
		}
	}

	async function approveContent(id: string) {
		setApproving(id);
		setError(null);
		try {
			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include', // Include cookies for authentication
				body: JSON.stringify({ action: 'approve' }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to approve content');
			}
			// Update item status to show approved state instead of removing
			setContentItems((items) =>
				items.map((item) =>
					item.id === id ? { ...item, status: 'Ready To Publish' } : item
				)
			);
			setSelectedItems((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		} catch (err: any) {
			console.error('Failed to approve content:', err);
			setError(err.message || 'Failed to approve content');
		} finally {
			setApproving(null);
		}
	}

	async function rejectContent(id: string) {
		const feedback = window.prompt('Share optional feedback for the rewrite (optional):') || '';
		setRejecting(id);
		setError(null);
		try {
			// Delete the content item instead of just updating status
			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include', // Include cookies for authentication
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to reject content');
			}
			// Remove item from list
			setContentItems((items) => items.filter((item) => item.id !== id));
			setSelectedItems((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		} catch (err: any) {
			console.error('Failed to reject content:', err);
			setError(err.message || 'Failed to reject content');
		} finally {
			setRejecting(null);
		}
	}

	async function copyImagePrompt(itemId: string, prompt: string) {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopySuccess((prev) => ({ ...prev, [itemId]: true }));
			setTimeout(() => {
				setCopySuccess((prev) => ({ ...prev, [itemId]: false }));
			}, 1500);
		} catch (error) {
			console.error('Failed to copy image prompt:', error);
		}
	}

	async function bulkApprove() {
		if (selectedItems.size === 0) return;
		setBulkApproving(true);
		setError(null);
		try {
			const promises = Array.from(selectedItems).map((id) =>
				fetch(`/api/content/queue/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include', // Include cookies for authentication
					body: JSON.stringify({ action: 'approve' }),
				})
			);
			const results = await Promise.all(promises);
			const failed = results.filter((r) => !r.ok);
			if (failed.length > 0) {
				throw new Error(`Failed to approve ${failed.length} item(s)`);
			}
			setContentItems((items) => items.filter((item) => !selectedItems.has(item.id)));
			setSelectedItems(new Set());
		} catch (err: any) {
			console.error('Failed to bulk approve:', err);
			setError(err.message || 'Failed to approve content');
		} finally {
			setBulkApproving(false);
		}
	}

	async function saveContentEdit(id: string) {
		setSaving(id);
		setError(null);
		try {
			const payload: any = {
				content: editingContent,
				title: editingTitle,
				hashtags: editingHashtags,
				image_prompt: editingImagePrompt,
			};

			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include', // Include cookies for authentication
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save content');
			}
			setContentItems((items) =>
				items.map((item) =>
					item.id === id
						? {
								...item,
								content: editingContent,
								title: editingTitle,
								hashtags: editingHashtags,
								image_prompt: editingImagePrompt,
							}
						: item
				)
			);
			setEditingItem(null);
			setEditingContent('');
			setEditingTitle('');
			setEditingHashtags('');
			setEditingImagePrompt('');
		} catch (err: any) {
			console.error('Failed to save content:', err);
			setError(err.message || 'Failed to save content');
		} finally {
			setSaving(null);
		}
	}

	async function saveScheduledTime(id: string) {
		setSaving(id);
		setError(null);
		try {
			// Convert datetime-local to ISO string for Airtable
			const isoString = editingScheduledTime 
				? new Date(editingScheduledTime).toISOString()
				: null;
			
			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include', // Include cookies for authentication
				body: JSON.stringify({ scheduled_time: isoString }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save scheduled time');
			}
			setContentItems((items) =>
				items.map((item) =>
					item.id === id ? { ...item, scheduled_date: isoString } : item
				)
			);
			setEditingScheduledTimeId(null);
			setEditingScheduledTime('');
		} catch (err: any) {
			console.error('Failed to save scheduled time:', err);
			setError(err.message || 'Failed to save scheduled time');
		} finally {
			setSaving(null);
		}
	}

	function startEdit(item: ContentItem) {
		setEditingItem(item.id);
		setEditingTitle(item.title);
		setEditingContent(item.content);
		setEditingHashtags(item.hashtags || '');
		setEditingImagePrompt(item.image_prompt || '');
	}

	function startEditScheduledTime(item: ContentItem) {
		setEditingScheduledTimeId(item.id);
		if (item.scheduled_date) {
			// Convert to local datetime-local format (YYYY-MM-DDTHH:mm)
			const date = new Date(item.scheduled_date);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			setEditingScheduledTime(`${year}-${month}-${day}T${hours}:${minutes}`);
		} else {
			// Set to current date/time as default
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			setEditingScheduledTime(`${year}-${month}-${day}T${hours}:${minutes}`);
		}
	}

	// Get min and max dates for date picker (next 30 days)
	function getMinDate(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	function getMaxDate(): string {
		const maxDate = new Date();
		maxDate.setDate(maxDate.getDate() + 30);
		const year = maxDate.getFullYear();
		const month = String(maxDate.getMonth() + 1).padStart(2, '0');
		const day = String(maxDate.getDate()).padStart(2, '0');
		const hours = '23';
		const minutes = '59';
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	function formatScheduledDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Not scheduled';
		const date = new Date(dateString);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function getContentPreview(content: string, maxLines: number = 3): string {
		const lines = content.split('\n').filter((line) => line.trim());
		return lines.slice(0, maxLines).join('\n');
	}

	function toggleSelect(id: string) {
		setSelectedItems((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	const allSelected = useMemo(
		() => contentItems.length > 0 && selectedItems.size === contentItems.length,
		[contentItems.length, selectedItems.size]
	);

	function toggleSelectAll() {
		if (allSelected) {
			setSelectedItems(new Set());
		} else {
			setSelectedItems(new Set(contentItems.map((item) => item.id)));
		}
	}

	async function handleImageUpload(contentId: string, file: File) {
		if (!file) return;

		// Clear any previous errors and success messages for this item
		setImageUploadError((prev) => {
			const next = { ...prev };
			delete next[contentId];
			return next;
		});
		setImageUploadSuccess((prev) => {
			const next = { ...prev };
			delete next[contentId];
			return next;
		});

		// Client-side validation
		const maxSize = 2 * 1024 * 1024; // 2 MB
		if (file.size > maxSize) {
			setImageUploadError((prev) => ({ ...prev, [contentId]: 'File too large. Maximum size is 2 MB.' }));
			return;
		}

		const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			setImageUploadError((prev) => ({ ...prev, [contentId]: 'Only JPG, PNG, and WebP supported.' }));
			return;
		}

		setUploadingImage(contentId);

		try {
			// Upload to Cloudinary
			const formData = new FormData();
			formData.append('file', file);

			const uploadRes = await fetch('/api/uploads/image', {
				method: 'POST',
				body: formData,
			});

			if (!uploadRes.ok) {
				const uploadData = await uploadRes.json().catch(() => ({}));
				throw new Error(uploadData?.error || 'Upload failed. Please try again.');
			}

			const { secureUrl, publicId } = await uploadRes.json();

			// Save to Airtable
			const saveRes = await fetch(`/api/content/queue/${contentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include', // Include cookies for authentication
				body: JSON.stringify({
					imageUrl: secureUrl,
					cloudinaryId: publicId,
					source: 'Brand',
				}),
			});

			if (!saveRes.ok) {
				const saveData = await saveRes.json().catch(() => ({}));
				throw new Error(saveData?.error || 'Could not save image. Please try again.');
			}

			// Optimistically update UI
			setContentItems((items) =>
				items.map((item) =>
					item.id === contentId
						? {
								...item,
								image_reference_url: secureUrl,
								image_cloudinary_id: publicId,
								image_generation_source: 'Brand',
							}
						: item
				)
			);

			// Show success message
			setImageUploadSuccess((prev) => ({ ...prev, [contentId]: true }));
			// Clear success message after 3 seconds
			setTimeout(() => {
				setImageUploadSuccess((prev) => {
					const next = { ...prev };
					delete next[contentId];
					return next;
				});
			}, 3000);
		} catch (err: any) {
			console.error('Image upload error:', err);
			setImageUploadError((prev) => ({ ...prev, [contentId]: err.message || 'Could not upload image. Please try again.' }));
		} finally {
			setUploadingImage(null);
		}
	}

	function handleImagePanelClick(contentId: string) {
		if (uploadingImage === contentId) {
			console.log('Upload in progress, ignoring click');
			return; // Don't allow clicks while uploading
		}
		const item = contentItems.find((item) => item.id === contentId);
		if (!item) {
			console.log('Item not found:', contentId);
			return;
		}
		if (!canUploadImage(item)) {
			console.log('Upload not allowed for this item status:', item.status);
			// Show message for published items
			setImageUploadError((prev) => ({ ...prev, [contentId]: 'Image upload is not available for published posts.' }));
			setTimeout(() => {
				setImageUploadError((prev) => {
					const next = { ...prev };
					delete next[contentId];
					return next;
				});
			}, 3000);
			return;
		}
		const input = fileInputRefs.current[contentId];
		if (input) {
			console.log('Triggering file input click for:', contentId);
			input.click();
		} else {
			console.error('File input not found for:', contentId);
		}
	}

	function canUploadImage(item: ContentItem): boolean {
		// Allow upload for all tiers and platforms
		// Allow upload for all statuses except Published (which is already live)
		// This makes image upload available for all content items
		return item.status !== 'Published';
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-7xl space-y-4">
				<div className="mb-6 space-y-3">
					<Skeleton height="32px" width="250px" />
					<Skeleton height="16px" width="300px" />
				</div>
				{Array.from({ length: 3 }).map((_, i) => (
					<ContentItemSkeleton key={i} />
				))}
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-6">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>

			<div className="mb-6 space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-semibold mb-2">Content Approval Queue</h1>
						<p className="text-text-dim">
							Review and approve content before it's published.
						</p>
					</div>
					{quotaRemaining !== null && (
						<div className="text-right">
							<div className="text-2xl font-bold text-primary">{quotaRemaining}</div>
							<div className="text-xs text-text-dim">Posts remaining</div>
						</div>
					)}
				</div>
				{error && (
					<div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-xl2 p-3">
						{error}
					</div>
				)}
			</div>

			{/* Brand Filter (if user has multiple brands) */}
			{brands.length > 1 && (
				<div className="mb-6">
					<label className="block text-sm font-medium text-text mb-2">
						Filter by Brand
					</label>
					<select
						value={selectedBrandId}
						onChange={(e) => setSelectedBrandId(e.target.value)}
						className="w-full max-w-sm px-4 py-3 rounded-xl2 border-2 border-white/40 bg-surface/50 text-text font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
					>
						<option value="all">All Brands</option>
						{brands.map((brand) => (
							<option key={brand.id} value={brand.id}>
								{brand.client_name}
							</option>
						))}
					</select>
				</div>
			)}

			{/* Channel Tabs */}
			<div className="mb-6">
				<div className="flex gap-2 border-b border-edge/60">
					{(['LinkedIn', 'X', 'Meta', 'Blog'] as ChannelTab[]).map((tab) => (
						<button
							key={tab}
							onClick={() => {
								setSelectedTab(tab);
								setSelectedItems(new Set()); // Clear selection when changing tabs
							}}
							className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
								selectedTab === tab
									? 'border-primary text-text'
									: 'border-transparent text-text-dim hover:text-text-soft'
							}`}
						>
							{tab}
						</button>
					))}
				</div>
			</div>

			{/* Status Summary */}
			{contentItems.length > 0 && (
				<div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
					<div>
						<div className="text-2xl font-bold text-text">{contentItems.length}</div>
						<div className="text-xs text-text-dim">Total Items</div>
					</div>
					<div>
						<div className="text-2xl font-bold text-accent">
							{contentItems.filter((item) => item.status === 'Ready To Publish').length}
						</div>
						<div className="text-xs text-text-dim">Ready To Publish</div>
					</div>
					<div>
						<div className="text-2xl font-bold text-primary">
							{contentItems.filter((item) => item.status === 'Published').length}
						</div>
						<div className="text-xs text-text-dim">Published</div>
					</div>
					<div>
						<div className="text-2xl font-bold text-warning">
							{contentItems.filter((item) => item.scheduled_date && new Date(item.scheduled_date) > new Date()).length}
						</div>
						<div className="text-xs text-text-dim">Scheduled</div>
					</div>
				</div>
			)}

			{contentItems.length === 0 ? (
				isGenerating ? (
					<div className="space-y-4">
						<div className="card p-6 text-center">
							<Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
							<p className="text-text-soft mb-2">Generating content...</p>
							<p className="text-sm text-text-dim">This may take a few moments</p>
						</div>
						{Array.from({ length: 3 }).map((_, i) => (
							<ContentItemSkeleton key={i} />
						))}
					</div>
				) : (
					<div className="card p-8 text-center">
						<p className="text-text-soft">No content pending approval</p>
					</div>
				)
			) : (
				<>
					{/* Bulk Actions Bar */}
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						className="card p-4 mb-4 flex items-center justify-between"
					>
						<div className="flex items-center gap-3">
							<input
								type="checkbox"
								checked={allSelected}
								onChange={toggleSelectAll}
								className="w-4 h-4 rounded border-edge/60 bg-surface/30 text-primary focus:ring-primary/20"
							/>
							<span className="text-sm text-text-soft">
								{selectedItems.size > 0 
									? `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} selected`
									: 'Select all'}
							</span>
						</div>
						{selectedItems.size > 0 && (
							<button
								onClick={bulkApprove}
								disabled={bulkApproving}
								className="px-4 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 hover:from-accent hover:to-accent/90 text-white font-medium shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
							>
								{bulkApproving ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Check className="w-4 h-4" />
								)}
								Approve Selected
							</button>
						)}
					</motion.div>

					<div className="space-y-4">
						{contentItems.map((item) => (
							<motion.div
								key={item.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								className="card p-6"
							>
								{/* Main Content Row: Text + Image Panel */}
								<div className="flex flex-col md:flex-row md:items-stretch gap-4 mb-4">
									{/* Left Column - Content Summary */}
									<div className="flex-1 min-w-0 space-y-4">
										{/* Title with Checkbox */}
										<div className="flex items-start gap-3">
											<input
												type="checkbox"
												checked={selectedItems.has(item.id)}
												onChange={() => toggleSelect(item.id)}
												className="w-4 h-4 rounded border-edge/60 bg-surface/30 text-primary focus:ring-primary/20 mt-1 flex-shrink-0"
											/>
											<h3 className="text-xl font-bold text-text leading-tight flex-1">
												{item.title}
											</h3>
										</div>

										{/* Platform + Brand + Content Type - Inline badges */}
										<div className="flex items-center gap-2 flex-wrap">
											<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 border border-primary/30 text-primary">
												{item.platform}
											</span>
											{item.post_type && item.post_type !== 'single' && (
												<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent/15 border border-accent/30 text-accent">
													{item.post_type}
													{item.thread_index && ` ${item.thread_index}`}
												</span>
											)}
											{item.platform === 'X' && typeof item.character_count === 'number' && (
												<span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
													item.character_count > 280
														? 'bg-danger/15 border-danger/30 text-danger'
														: 'bg-surface/50 border-edge/60 text-text-soft'
												}`}>
													{item.character_count}/280
												</span>
											)}
											{item.status === 'Needs Copy' && (
												<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-warning/15 border border-warning/30 text-warning">
													Needs editing
												</span>
											)}
											{item.visual_brief && (
												<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface/50 border border-edge/60 text-text-soft">
													Visual suggested
												</span>
											)}
											{item.content_type && (
												<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface/50 border border-edge/60 text-text-soft">
													{item.content_type}
												</span>
											)}
											<span className="text-sm text-text-dim">
												{item.brand_name}
											</span>
										</div>

										{/* Export-only warning for X threads and Blog */}
										{((item.platform === 'X' && item.post_type === 'thread') || item.platform === 'Blog') && (
											<div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
												{item.platform === 'X' && item.post_type === 'thread' 
													? '📋 Threads are export-only. Copy and paste to publish manually.'
													: '📋 Blog posts are export-only. Copy and publish to your blog manually.'}
											</div>
										)}

										{/* Status Badge - Show prominently if Ready To Publish or Published */}
										{item.status === 'Ready To Publish' && (
											<div className="flex items-center gap-2">
												<span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-accent/20 border border-accent/40 text-accent flex items-center gap-1.5">
													<Check className="w-3 h-3" />
													Approved
												</span>
												{item.scheduled_date ? (
													<span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 border border-primary/30 text-primary flex items-center gap-1.5">
														<Clock className="w-3 h-3" />
														Scheduled: {formatScheduledDate(item.scheduled_date)}
													</span>
												) : (
													<span className="px-3 py-1.5 rounded-full text-xs font-medium bg-warning/10 border border-warning/30 text-warning flex items-center gap-1.5">
														<Clock className="w-3 h-3" />
														Publishing soon
													</span>
												)}
											</div>
										)}
										{item.status === 'Published' && item.published_at && (
											<div className="flex items-center gap-2">
												<span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/20 border border-primary/40 text-primary flex items-center gap-1.5">
													<Check className="w-3 h-3" />
													Published
												</span>
												<span className="text-xs text-text-dim">
													{new Date(item.published_at).toLocaleString()}
												</span>
											</div>
										)}

										{/* Body Preview - 3 lines with fade - Clickable */}
										<div 
											className="relative cursor-pointer hover:opacity-80 transition-opacity"
											onClick={() => {
												if (editingItem !== item.id) {
													startEdit(item);
												}
											}}
										>
											<div 
												className="text-sm text-text-soft leading-relaxed"
												style={{
													display: '-webkit-box',
													WebkitLineClamp: 3,
													WebkitBoxOrient: 'vertical',
													overflow: 'hidden',
													maxHeight: '4.5rem',
												}}
											>
												{getContentPreview(item.content)}
											</div>
											<div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-bg to-transparent pointer-events-none" />
										</div>

										{/* Hashtags */}
										{item.hashtags && (
											<div className="text-xs text-text-dim break-words">
												<span className="font-medium">Hashtags:</span> <span className="break-all">{item.hashtags}</span>
											</div>
										)}

										{/* Suggested Image Prompt */}
										{item.image_prompt && (
											<div className="text-xs text-text-dim break-words">
												<div className="flex items-center gap-2 mb-1">
													<span className="font-medium">Suggested image prompt:</span>
													<button
														type="button"
														onClick={() => copyImagePrompt(item.id, item.image_prompt || '')}
														className="group inline-flex items-center justify-center rounded-md border border-edge/60 bg-surface/30 p-1 text-text-soft hover:bg-surface/50"
														aria-label="Copy image prompt"
													>
														{copySuccess[item.id] ? (
															<Check className="w-3 h-3 text-accent" />
														) : (
															<Copy className="w-3 h-3" />
														)}
														<span className="sr-only">Copy image prompt</span>
														<span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md border border-edge/60 bg-surface/90 px-2 py-1 text-[10px] text-text-soft opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
															Copy image prompt
														</span>
													</button>
												</div>
												<div className="break-all">{item.image_prompt}</div>
											</div>
										)}
									</div>

									{/* Right Column - Compact Image Panel */}
									<div className="w-full md:w-48 lg:w-56 h-full flex-shrink-0">
										<button
											type="button"
											onClick={() => handleImagePanelClick(item.id)}
											disabled={uploadingImage === item.id}
											className={`
												group relative flex h-full w-full flex-col items-center justify-center rounded-xl2 border border-edge/60 bg-surface/40 px-3 py-3 text-center transition-all
												${uploadingImage !== item.id ? 'hover:border-primary/60 hover:bg-surface/60 cursor-pointer' : 'pointer-events-none opacity-60'}
											`}
										>
											{uploadingImage === item.id ? (
												<div className="flex flex-col items-center justify-center gap-2 text-xs text-text-soft">
													<Loader2 className="w-4 h-4 animate-spin text-primary" />
													<span>Uploading image...</span>
												</div>
											) : item.image_reference_url ? (
												<>
													<img
														src={item.image_reference_url}
														alt="Post image"
														className="h-full w-full rounded-lg object-cover"
														onError={(e) => {
															// Fallback to no image state if image fails to load
															const target = e.target as HTMLImageElement;
															target.style.display = 'none';
														}}
													/>
													{canUploadImage(item) && (
														<div className="absolute inset-0 hidden items-end justify-center bg-black/50 p-2 rounded-lg group-hover:flex pointer-events-none">
															<div className="w-full text-left">
																<div className="font-medium text-text text-xs mb-0.5">Change image</div>
																<div className="text-[11px] text-text-dim">
																	JPG, PNG or WebP up to 2 MB
																</div>
															</div>
														</div>
													)}
												</>
											) : (
												<div className="flex flex-col items-center justify-center gap-2 text-xs text-text-soft">
													<ImageIcon className="h-6 w-6 text-text-dim" />
													<span className="font-medium">No image attached</span>
													{canUploadImage(item) ? (
														<>
															<span className="text-[11px] text-text-dim">
																Click to upload (optional)
															</span>
															<span className="text-[10px] text-text-dim">
																JPG, PNG or WebP up to 2 MB
															</span>
														</>
													) : (
														<span className="text-[11px] text-text-dim">
															Image upload not available
														</span>
													)}
												</div>
											)}
											<input
												type="file"
												accept="image/jpeg,image/jpg,image/png,image/webp"
												className="hidden"
												ref={(el) => {
													if (el) {
														fileInputRefs.current[item.id] = el;
													} else {
														delete fileInputRefs.current[item.id];
													}
												}}
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														handleImageUpload(item.id, file);
													}
													// Reset input so same file can be selected again
													e.target.value = '';
												}}
												disabled={uploadingImage === item.id || !canUploadImage(item)}
											/>
										</button>
										{/* Success/Error Messages */}
										{imageUploadSuccess[item.id] && (
											<div className="mt-2 text-xs text-accent flex items-center gap-1">
												<Check className="w-3 h-3" />
												Image added to this post.
											</div>
										)}
										{imageUploadError[item.id] && (
											<div className="mt-2 text-xs text-danger">{imageUploadError[item.id]}</div>
										)}
									</div>
								</div>

								{/* Bottom Row: Scheduled Time + Actions */}
								<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4 border-t border-edge/60">
									{/* Scheduled Time - Editable */}
									<div className="flex items-center gap-2">
										<Calendar className="w-4 h-4 text-text-dim flex-shrink-0" />
											{editingScheduledTimeId === item.id ? (
												<div className="flex items-center gap-2 flex-1">
													<input
														type="datetime-local"
														value={editingScheduledTime}
														onChange={(e) => setEditingScheduledTime(e.target.value)}
														min={getMinDate()}
														max={getMaxDate()}
														className="flex-1 px-2 py-1 text-sm rounded-lg border border-edge/60 bg-surface/30 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														title="Select a date within the next 30 days"
													/>
													<button
														onClick={() => saveScheduledTime(item.id)}
														disabled={saving === item.id}
														className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50"
													>
														{saving === item.id ? (
															<Loader2 className="w-4 h-4 animate-spin" />
														) : (
															<Save className="w-4 h-4" />
														)}
													</button>
													<button
														onClick={() => {
															setEditingScheduledTimeId(null);
															setEditingScheduledTime('');
														}}
														className="p-1.5 rounded-lg hover:bg-surface/50 text-text-dim"
													>
														<X className="w-4 h-4" />
													</button>
												</div>
											) : (
												<div className="flex items-center gap-2 flex-1 justify-end">
													<span className="text-sm text-text-dim text-right">
														{formatScheduledDate(item.scheduled_date)}
													</span>
													<button
														onClick={() => startEditScheduledTime(item)}
														className="p-1.5 rounded-lg hover:bg-surface/50 text-text-dim"
														title="Edit scheduled time"
													>
														<Edit2 className="w-3.5 h-3.5" />
													</button>
												</div>
											)}
										</div>

									{/* Actions */}
									<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
										{/* View/Edit Button */}
										<div className="flex justify-end md:justify-start">
												<button
													onClick={() => {
														if (editingItem === item.id) {
															setEditingItem(null);
															setEditingContent('');
															setEditingTitle('');
															setEditingHashtags('');
															setEditingImagePrompt('');
														} else {
															startEdit(item);
														}
													}}
													className="px-3 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2 text-sm"
												>
													{editingItem === item.id ? (
														<>
															<Eye className="w-4 h-4" />
															Close
														</>
													) : (
														<>
															<Edit2 className="w-4 h-4" />
															View/Edit
														</>
													)}
												</button>
											</div>

											{/* Approve/Reject Buttons */}
											{item.status === 'Ready To Publish' ? (
												<div className="flex-1 px-3 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 text-white text-sm font-medium shadow-lg shadow-accent/20 flex items-center justify-center gap-2">
													<Check className="w-3.5 h-3.5" />
													Approved
												</div>
											) : (
												<div className="flex gap-2">
													<button
														onClick={() => approveContent(item.id)}
														disabled={
															approving === item.id || 
															rejecting === item.id || 
															saving === item.id || 
															uploadingImage === item.id ||
															// Disable approve for validation failures
															(item.platform === 'X' && typeof item.character_count === 'number' && item.character_count > 280) ||
															item.status === 'Needs Copy'
														}
														title={
															(item.platform === 'X' && typeof item.character_count === 'number' && item.character_count > 280)
																? 'Tweet exceeds 280 characters. Edit before approving.'
																: item.status === 'Needs Copy'
																? 'This content needs editing before approval.'
																: undefined
														}
														className="flex-1 px-3 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 hover:from-accent hover:to-accent/90 text-white text-sm font-medium shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
													>
														{approving === item.id ? (
															<Loader2 className="w-3.5 h-3.5 animate-spin" />
														) : (
															<Check className="w-3.5 h-3.5" />
														)}
														Approve
													</button>
													<button
														onClick={() => rejectContent(item.id)}
														disabled={approving === item.id || rejecting === item.id || saving === item.id || uploadingImage === item.id}
														className="px-3 py-2 rounded-xl2 border border-danger/40 bg-transparent hover:bg-danger/10 text-danger text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
													>
														{rejecting === item.id ? (
															<Loader2 className="w-3.5 h-3.5 animate-spin" />
														) : (
															<X className="w-3.5 h-3.5" />
														)}
														Reject
													</button>
												</div>
											)}
									</div>
								</div>

								{/* Expanded Content Editor */}
								{editingItem === item.id && editingScheduledTimeId !== item.id && (
									<AnimatePresence>
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: 'auto' }}
											exit={{ opacity: 0, height: 0 }}
											className="mt-6 pt-6 border-t border-edge/60"
										>
											<div className="space-y-4">
												{/* Title Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Title (hook)
													</label>
													<input
														type="text"
														value={editingTitle}
														onChange={(e) => setEditingTitle(e.target.value)}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="Enter post title..."
													/>
												</div>

												{/* Content Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Content
													</label>
													<textarea
														value={editingContent}
														onChange={(e) => setEditingContent(e.target.value)}
														rows={12}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
														placeholder="Enter post content..."
													/>
												</div>

												{/* Hashtags Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Hashtags
													</label>
													<input
														type="text"
														value={editingHashtags}
														onChange={(e) => setEditingHashtags(e.target.value)}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="Enter hashtags (comma-separated)..."
													/>
												</div>

												{/* Image Prompt Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Suggested image prompt
													</label>
													<textarea
														value={editingImagePrompt}
														onChange={(e) => setEditingImagePrompt(e.target.value)}
														rows={4}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
														placeholder="Enter a suggested image prompt..."
													/>
													<p className="mt-2 text-xs text-text-dim">
														This won't be published. Use it to create your own image.
													</p>
												</div>

												<div className="flex gap-2">
													<button
														onClick={() => saveContentEdit(item.id)}
														disabled={saving === item.id}
														className="px-4 py-2 rounded-xl2 bg-gradient-to-r from-primary/90 to-primary/70 hover:from-primary hover:to-primary/90 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
													>
														{saving === item.id ? (
															<Loader2 className="w-4 h-4 animate-spin" />
														) : (
															<Save className="w-4 h-4" />
														)}
														Save Changes
													</button>
													<button
														onClick={() => {
															setEditingItem(null);
															setEditingContent('');
															setEditingTitle('');
															setEditingHashtags('');
															setEditingImagePrompt('');
														}}
														className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50"
													>
														Cancel
													</button>
												</div>
											</div>
										</motion.div>
									</AnimatePresence>
								)}
							</motion.div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
