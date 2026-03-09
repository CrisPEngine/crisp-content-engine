'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventInput } from '@fullcalendar/core';

type ScheduledItem = {
	id: string;
	title: string;
	platform: string;
	scheduled_date: string;
	status: string;
	brand_name: string;
	content_preview: string;
};

type Props = {
	items: ScheduledItem[];
	onReschedule: (contentId: string, newDate: string) => Promise<boolean>;
};

const PLATFORM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
	LinkedIn: { bg: '#1B3A5C', border: '#2D6DB5', text: '#8AB4F8' },
	X: { bg: '#1A2030', border: '#4A5568', text: '#B5C0CF' },
	Blog: { bg: '#0D3A2A', border: '#2D8B6A', text: '#4FF0B8' },
	Facebook: { bg: '#1B2A4A', border: '#3B5998', text: '#8AB4F8' },
	Instagram: { bg: '#3A1A3A', border: '#C13584', text: '#E1306C' },
};

const DEFAULT_COLOR = { bg: '#1A2030', border: '#4A5568', text: '#B5C0CF' };

const STATUS_DOT: Record<string, string> = {
	Scheduled: '#8AB4F8',
	'Ready To Publish': '#8AB4F8',
	Published: '#4FF0B8',
	Failed: '#FF6D6D',
};

export default function ScheduleCalendarView({ items, onReschedule }: Props) {
	const calendarRef = useRef<FullCalendar>(null);
	const [tooltip, setTooltip] = useState<{
		x: number;
		y: number;
		item: ScheduledItem;
	} | null>(null);

	const events: EventInput[] = items
		.filter((item) => item.scheduled_date)
		.map((item) => {
			const colors = PLATFORM_COLORS[item.platform] || DEFAULT_COLOR;
			return {
				id: item.id,
				title: item.title || 'Untitled',
				start: item.scheduled_date,
				allDay: true,
				editable: item.status !== 'Published',
				backgroundColor: colors.bg,
				borderColor: colors.border,
				textColor: colors.text,
				extendedProps: {
					platform: item.platform,
					status: item.status,
					brand_name: item.brand_name,
					content_preview: item.content_preview,
				},
			};
		});

	const handleEventDrop = useCallback(
		async (info: EventDropArg) => {
			const newDate = info.event.startStr;
			const ok = await onReschedule(info.event.id, newDate);
			if (!ok) {
				info.revert();
			}
		},
		[onReschedule]
	);

	const handleEventMouseEnter = useCallback((info: { el: HTMLElement; event: any }) => {
		const rect = info.el.getBoundingClientRect();
		const item: ScheduledItem = {
			id: info.event.id,
			title: info.event.title,
			platform: info.event.extendedProps.platform,
			scheduled_date: info.event.startStr,
			status: info.event.extendedProps.status,
			brand_name: info.event.extendedProps.brand_name,
			content_preview: info.event.extendedProps.content_preview,
		};
		setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, item });
	}, []);

	const handleEventMouseLeave = useCallback(() => {
		setTooltip(null);
	}, []);

	useEffect(() => {
		const handleScroll = () => setTooltip(null);
		window.addEventListener('scroll', handleScroll, true);
		return () => window.removeEventListener('scroll', handleScroll, true);
	}, []);

	return (
		<div className="schedule-calendar-wrapper">
			<div className="flex flex-wrap gap-4 mb-4 text-xs text-text-dim">
				{Object.entries(PLATFORM_COLORS).map(([platform, colors]) => (
					<span key={platform} className="flex items-center gap-1.5">
						<span
							className="inline-block w-2.5 h-2.5 rounded-sm"
							style={{ backgroundColor: colors.border }}
						/>
						{platform}
					</span>
				))}
			</div>

			<FullCalendar
				ref={calendarRef}
				plugins={[dayGridPlugin, interactionPlugin]}
				initialView="dayGridMonth"
				events={events}
				editable
				droppable={false}
				eventDrop={handleEventDrop}
				eventMouseEnter={handleEventMouseEnter}
				eventMouseLeave={handleEventMouseLeave}
				headerToolbar={{
					left: 'prev,next today',
					center: 'title',
					right: '',
				}}
				dayMaxEvents={3}
				moreLinkContent={(args) => `+${args.num} more`}
				height="auto"
				firstDay={1}
				eventDisplay="block"
				eventContent={(arg) => {
					const dotColor = STATUS_DOT[arg.event.extendedProps.status] || '#8190A6';
					return (
						<div className="flex items-center gap-1.5 px-1.5 py-0.5 overflow-hidden cursor-grab active:cursor-grabbing">
							<span
								className="shrink-0 w-1.5 h-1.5 rounded-full"
								style={{ backgroundColor: dotColor }}
							/>
							<span className="truncate text-[11px] leading-tight font-medium">
								{arg.event.title}
							</span>
						</div>
					);
				}}
			/>

			{tooltip && (
				<div
					className="fixed z-50 pointer-events-none"
					style={{
						left: tooltip.x,
						top: tooltip.y,
						transform: 'translate(-50%, -100%)',
					}}
				>
					<div className="card px-3 py-2 text-xs max-w-[260px] shadow-lg">
						<p className="font-semibold text-text truncate">{tooltip.item.title}</p>
						<div className="flex items-center gap-2 mt-1 text-text-dim">
							<span
								className="px-1.5 py-0.5 rounded text-[10px] font-medium"
								style={{
									backgroundColor: (PLATFORM_COLORS[tooltip.item.platform] || DEFAULT_COLOR).bg,
									color: (PLATFORM_COLORS[tooltip.item.platform] || DEFAULT_COLOR).text,
									border: `1px solid ${(PLATFORM_COLORS[tooltip.item.platform] || DEFAULT_COLOR).border}`,
								}}
							>
								{tooltip.item.platform}
							</span>
							<span>{tooltip.item.status}</span>
						</div>
						<p className="mt-1 text-text-dim">{tooltip.item.brand_name}</p>
						{tooltip.item.content_preview && (
							<p className="mt-1 text-text-soft line-clamp-2">{tooltip.item.content_preview}</p>
						)}
					</div>
				</div>
			)}

			<style>{`
				.schedule-calendar-wrapper .fc {
					--fc-border-color: rgba(17, 24, 33, 0.6);
					--fc-page-bg-color: transparent;
					--fc-neutral-bg-color: rgba(15, 20, 26, 0.5);
					--fc-today-bg-color: rgba(138, 180, 248, 0.06);
					--fc-event-border-color: transparent;
					font-family: inherit;
				}

				.schedule-calendar-wrapper .fc .fc-toolbar-title {
					color: var(--text);
					font-size: 1.25rem;
					font-weight: 600;
				}

				.schedule-calendar-wrapper .fc .fc-button {
					background: rgba(15, 20, 26, 0.8);
					border: 1px solid rgba(17, 24, 33, 0.6);
					color: var(--text-soft);
					font-size: 0.8125rem;
					padding: 0.375rem 0.75rem;
					border-radius: 10px;
					transition: all 0.15s;
				}

				.schedule-calendar-wrapper .fc .fc-button:hover {
					background: rgba(138, 180, 248, 0.1);
					border-color: rgba(138, 180, 248, 0.3);
					color: var(--primary);
				}

				.schedule-calendar-wrapper .fc .fc-button-active,
				.schedule-calendar-wrapper .fc .fc-button:active {
					background: rgba(138, 180, 248, 0.15) !important;
					border-color: rgba(138, 180, 248, 0.4) !important;
					color: var(--primary) !important;
				}

				.schedule-calendar-wrapper .fc .fc-col-header-cell {
					background: rgba(15, 20, 26, 0.5);
					border-color: rgba(17, 24, 33, 0.6);
					padding: 0.5rem 0;
				}

				.schedule-calendar-wrapper .fc .fc-col-header-cell-cushion {
					color: var(--text-dim);
					font-size: 0.75rem;
					font-weight: 500;
					text-transform: uppercase;
					letter-spacing: 0.05em;
					text-decoration: none;
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-day {
					border-color: rgba(17, 24, 33, 0.6);
					transition: background 0.15s;
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-day:hover {
					background: rgba(138, 180, 248, 0.03);
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-day-number {
					color: var(--text-dim);
					font-size: 0.8125rem;
					padding: 0.375rem 0.5rem;
					text-decoration: none;
				}

				.schedule-calendar-wrapper .fc .fc-day-today .fc-daygrid-day-number {
					color: var(--primary);
					font-weight: 600;
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-event {
					border-radius: 6px;
					margin: 1px 2px;
					border-left-width: 3px;
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-event:hover {
					filter: brightness(1.2);
				}

				.schedule-calendar-wrapper .fc .fc-more-link {
					color: var(--primary);
					font-size: 0.7rem;
					font-weight: 500;
				}

				.schedule-calendar-wrapper .fc .fc-day-other .fc-daygrid-day-number {
					color: rgba(129, 144, 166, 0.4);
				}

				.schedule-calendar-wrapper .fc .fc-popover {
					background: var(--surface);
					border: 1px solid rgba(17, 24, 33, 0.6);
					border-radius: 12px;
					box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
				}

				.schedule-calendar-wrapper .fc .fc-popover-header {
					background: rgba(15, 20, 26, 0.8);
					color: var(--text-soft);
					border-radius: 12px 12px 0 0;
				}

				.schedule-calendar-wrapper .fc .fc-scrollgrid {
					border-radius: 16px;
					overflow: hidden;
					border: 1px solid rgba(17, 24, 33, 0.6);
				}

				.schedule-calendar-wrapper .fc .fc-scrollgrid td:last-child {
					border-right: none;
				}

				.schedule-calendar-wrapper .fc .fc-scrollgrid tr:last-child td {
					border-bottom: none;
				}
			`}</style>
		</div>
	);
}
