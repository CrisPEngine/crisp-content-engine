'use client';

import { useRef, useCallback, useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { parseUtcPublishAtIso } from '@/lib/datetime/gstSchedule';
import { useIsMobileViewport, usePrefersCoarsePointer } from '@/lib/hooks/useMediaQuery';
import { ScheduleAgendaView } from '@/components/schedule/ScheduleAgendaView';
import { ScheduleItemDetailSheet } from '@/components/schedule/ScheduleItemDetailSheet';
import {
	platformColor,
	PLATFORM_COLORS,
	type ScheduleCalendarItem,
} from '@/lib/schedule/schedulePresentation';

type Props = {
	items: ScheduleCalendarItem[];
	onReschedule: (contentId: string, newDate: string) => Promise<boolean>;
	onUnschedule: (contentId: string) => Promise<boolean>;
	onItemUpdated?: (contentId: string, patch: Partial<ScheduleCalendarItem>) => void;
};

const STATUS_DOT: Record<string, string> = {
	Scheduled: '#8AB4F8',
	'Ready To Publish': '#8AB4F8',
	Publishing: '#8AB4F8',
	Published: '#4FF0B8',
	Failed: '#FF6D6D',
	Overdue: '#FF6D6D',
};

export default function ScheduleCalendarView({ items, onReschedule, onUnschedule, onItemUpdated }: Props) {
	const calendarRef = useRef<FullCalendar>(null);
	const isMobile = useIsMobileViewport();
	const coarsePointer = usePrefersCoarsePointer();
	const [calendarLayoutOverride, setCalendarLayoutOverride] = useState<'agenda' | 'month' | null>(null);
	const calendarLayout = calendarLayoutOverride ?? (isMobile ? 'agenda' : 'month');
	const [selectedItem, setSelectedItem] = useState<ScheduleCalendarItem | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

	const events: EventInput[] = items
		.filter((item) => item.scheduled_date)
		.map((item) => {
			const colors = platformColor(item.platform);
			return {
				id: item.id,
				title: item.title || 'Untitled',
				start: item.scheduled_date,
				allDay: false,
				editable: !coarsePointer && item.status !== 'Published',
				backgroundColor: colors.bg,
				borderColor: colors.border,
				textColor: colors.text,
				extendedProps: {
					platform: item.platform,
					status: item.status,
				},
			};
		});

	function openItem(item: ScheduleCalendarItem) {
		setSelectedItem(item);
		setSheetOpen(true);
	}

	function combineDropWithExistingTime(existingIso: string, dropStart: Date | null): string | null {
		if (!dropStart) return null;
		const existing = parseUtcPublishAtIso(existingIso);
		if (!existing.isValid) return dropStart.toISOString();
		const dropped = DateTime.fromJSDate(dropStart, { zone: 'utc' });
		const merged = dropped.set({
			hour: existing.hour,
			minute: existing.minute,
			second: existing.second,
			millisecond: existing.millisecond,
		});
		return merged.toISO() ?? dropStart.toISOString();
	}

	const handleEventDrop = useCallback(
		async (info: EventDropArg) => {
			const full = itemById.get(info.event.id);
			const existingIso = full?.scheduled_date ?? String(info.event.startStr);
			const newDate = combineDropWithExistingTime(existingIso, info.event.start);
			if (!newDate) {
				info.revert();
				return;
			}
			const ok = await onReschedule(info.event.id, newDate);
			if (!ok) {
				info.revert();
			}
		},
		[itemById, onReschedule],
	);

	const handleEventClick = useCallback(
		(info: EventClickArg) => {
			const full = itemById.get(info.event.id);
			if (full) {
				openItem(full);
				return;
			}
			openItem({
				id: info.event.id,
				title: info.event.title,
				platform: String(info.event.extendedProps.platform ?? ''),
				scheduled_date: info.event.startStr,
				status: String(info.event.extendedProps.status ?? ''),
				brand_name: '',
				content_preview: info.event.title,
			});
		},
		[itemById],
	);

	return (
		<div className="schedule-calendar-wrapper min-w-0">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
				<div className="flex flex-wrap gap-x-3 gap-y-2 text-xs text-text-dim max-w-full">
					{Object.entries(PLATFORM_COLORS).map(([platform, colors]) => (
						<span key={platform} className="flex items-center gap-1.5 shrink-0">
							<span
								className="inline-block w-2.5 h-2.5 rounded-sm"
								style={{ backgroundColor: colors.border }}
							/>
							{platform}
						</span>
					))}
				</div>
				<div className="flex rounded-xl2 border border-edge/60 overflow-hidden shrink-0 self-start">
					<button
						type="button"
						onClick={() => setCalendarLayoutOverride('agenda')}
						className={`px-3 py-2 min-h-[44px] text-sm transition ${
							calendarLayout === 'agenda'
								? 'bg-primary/15 text-primary'
								: 'bg-surface/30 text-text-dim hover:text-text'
						}`}
					>
						Agenda
					</button>
					<button
						type="button"
						onClick={() => setCalendarLayoutOverride('month')}
						className={`px-3 py-2 min-h-[44px] text-sm transition ${
							calendarLayout === 'month'
								? 'bg-primary/15 text-primary'
								: 'bg-surface/30 text-text-dim hover:text-text'
						}`}
					>
						Month
					</button>
				</div>
			</div>

			{coarsePointer && calendarLayout === 'month' ? (
				<p className="text-xs text-text-dim mb-3">
					Tap an event to open details. Drag to reschedule is available on desktop.
				</p>
			) : null}

			{calendarLayout === 'agenda' ? (
				<ScheduleAgendaView items={items} onSelectItem={openItem} />
			) : (
				<div className="min-w-0 overflow-x-hidden">
					<FullCalendar
						ref={calendarRef}
						plugins={[dayGridPlugin, interactionPlugin]}
						initialView="dayGridMonth"
						events={events}
						editable={!coarsePointer}
						droppable={false}
						eventDrop={handleEventDrop}
						eventClick={handleEventClick}
						headerToolbar={{
							left: 'prev,next today',
							center: 'title',
							right: '',
						}}
						dayMaxEvents={isMobile ? 2 : 3}
						moreLinkClick="popover"
						height="auto"
						firstDay={1}
						eventDisplay="block"
						eventContent={(arg) => {
							const dotColor = STATUS_DOT[String(arg.event.extendedProps.status)] || '#8190A6';
							return (
								<div className="flex items-center gap-1.5 px-1.5 py-1 overflow-hidden cursor-pointer min-h-[28px]">
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
				</div>
			)}

			<ScheduleItemDetailSheet
				item={selectedItem}
				open={sheetOpen}
				onClose={() => {
					setSheetOpen(false);
					setSelectedItem(null);
				}}
				onReschedule={onReschedule}
				onUnschedule={onUnschedule}
				onContentUpdated={(contentId, next) => {
					onItemUpdated?.(contentId, {
						content: next.content,
						content_preview: next.content.slice(0, 280),
					});
					setSelectedItem((prev) =>
						prev && prev.id === contentId
							? { ...prev, content: next.content, content_preview: next.content.slice(0, 280) }
							: prev,
					);
				}}
			/>

			<style>{`
				.schedule-calendar-wrapper .fc {
					--fc-border-color: rgba(17, 24, 33, 0.6);
					--fc-page-bg-color: transparent;
					--fc-neutral-bg-color: rgba(15, 20, 26, 0.5);
					--fc-today-bg-color: rgba(138, 180, 248, 0.06);
					--fc-event-border-color: transparent;
					font-family: inherit;
					max-width: 100%;
				}

				.schedule-calendar-wrapper .fc .fc-view-harness {
					overflow-x: hidden;
				}

				.schedule-calendar-wrapper .fc .fc-scrollgrid {
					width: 100% !important;
				}

				.schedule-calendar-wrapper .fc .fc-toolbar {
					flex-wrap: wrap;
					gap: 0.5rem;
				}

				.schedule-calendar-wrapper .fc .fc-toolbar-title {
					color: var(--text);
					font-size: 1.125rem;
					font-weight: 600;
				}

				.schedule-calendar-wrapper .fc .fc-button {
					background: rgba(15, 20, 26, 0.8);
					border: 1px solid rgba(17, 24, 33, 0.6);
					color: var(--text-soft);
					font-size: 0.8125rem;
					padding: 0.5rem 0.75rem;
					min-height: 44px;
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
					padding: 0.35rem 0;
				}

				.schedule-calendar-wrapper .fc .fc-col-header-cell-cushion {
					color: var(--text-dim);
					font-size: 0.65rem;
					font-weight: 500;
					text-transform: uppercase;
					letter-spacing: 0.04em;
					text-decoration: none;
					padding: 0.25rem;
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-day {
					border-color: rgba(17, 24, 33, 0.6);
				}

				.schedule-calendar-wrapper .fc .fc-daygrid-day-number {
					color: var(--text-dim);
					font-size: 0.75rem;
					padding: 0.25rem 0.35rem;
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

				.schedule-calendar-wrapper .fc .fc-more-link {
					color: var(--primary);
					font-size: 0.7rem;
					font-weight: 500;
				}

				.schedule-calendar-wrapper .fc .fc-popover {
					background: var(--surface);
					border: 1px solid rgba(17, 24, 33, 0.6);
					border-radius: 12px;
					box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
					max-width: min(100vw - 2rem, 320px);
				}

				.schedule-calendar-wrapper .fc .fc-scrollgrid {
					border-radius: 16px;
					overflow: hidden;
					border: 1px solid rgba(17, 24, 33, 0.6);
				}
			`}</style>
		</div>
	);
}
