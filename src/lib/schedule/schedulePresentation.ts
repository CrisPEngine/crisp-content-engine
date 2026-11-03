export type ScheduleCalendarItem = {
	id: string;
	title: string;
	platform: string;
	scheduled_date: string;
	status: string;
	brand_name: string;
	content_preview: string;
	content?: string;
	image_reference_url?: string | null;
	external_url?: string | null;
	last_publish_error?: string | null;
	brand_profile_id?: string;
};

export const PLATFORM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
	LinkedIn: { bg: '#1B3A5C', border: '#2D6DB5', text: '#8AB4F8' },
	X: { bg: '#1A2030', border: '#4A5568', text: '#B5C0CF' },
	Blog: { bg: '#0D3A2A', border: '#2D8B6A', text: '#4FF0B8' },
	Facebook: { bg: '#1B2A4A', border: '#3B5998', text: '#8AB4F8' },
	Instagram: { bg: '#3A1A3A', border: '#C13584', text: '#E1306C' },
	Threads: { bg: '#1A2030', border: '#6B7280', text: '#D1D5DB' },
	Reddit: { bg: '#3A2010', border: '#FF4500', text: '#FF8A65' },
};

export const DEFAULT_PLATFORM_COLOR = { bg: '#1A2030', border: '#4A5568', text: '#B5C0CF' };

export function platformColor(platform: string) {
	return PLATFORM_COLORS[platform] || DEFAULT_PLATFORM_COLOR;
}

export function canRescheduleScheduleItem(status: string): boolean {
	return status !== 'Published';
}

export function canUnscheduleScheduleItem(status: string): boolean {
	return (
		status === 'Scheduled' ||
		status === 'Ready To Publish' ||
		status === 'Overdue' ||
		status === 'Publishing' ||
		status === 'Failed'
	);
}

export function canEditScheduleItemText(status: string): boolean {
	return status !== 'Published' && status !== 'Publishing';
}

export function statusBadgeClass(status: string): string {
	if (status === 'Scheduled' || status === 'Ready To Publish' || status === 'Publishing') {
		return 'bg-primary/15 border-primary/30 text-primary';
	}
	if (status === 'Published') {
		return 'bg-accent/15 border-accent/30 text-accent';
	}
	return 'bg-danger/15 border-danger/30 text-danger';
}
