'use client';

import { formatAgendaItemTime, groupScheduleItemsByDay } from '@/lib/schedule/scheduleAgenda';
import {
	platformColor,
	statusBadgeClass,
	type ScheduleCalendarItem,
} from '@/lib/schedule/schedulePresentation';

type Props = {
	items: ScheduleCalendarItem[];
	onSelectItem: (item: ScheduleCalendarItem) => void;
};

export function ScheduleAgendaView({ items, onSelectItem }: Props) {
	const days = groupScheduleItemsByDay(items);

	if (days.length === 0) {
		return (
			<div className="card p-8 text-center text-text-dim text-sm">
				No scheduled items in this range.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{days.map((day) => (
				<section key={day.dayKey} className="card overflow-hidden">
					<h3 className="px-4 py-3 text-sm font-semibold text-text border-b border-edge/60 bg-surface/40">
						{day.label}
					</h3>
					<ul className="divide-y divide-edge/40">
						{day.items.map((item) => {
							const colors = platformColor(item.platform);
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => onSelectItem(item)}
										className="w-full text-left px-4 py-3.5 min-h-[52px] hover:bg-primary/5 active:bg-primary/10 transition-colors"
									>
										<div className="flex items-start gap-3">
											<span className="shrink-0 text-xs font-medium text-text-dim tabular-nums pt-0.5 w-16">
												{formatAgendaItemTime(item.scheduled_date)}
											</span>
											<div className="min-w-0 flex-1 space-y-2">
												<p className="text-sm font-medium text-text leading-snug break-words">
													{item.title || 'Untitled'}
												</p>
												<div className="flex flex-wrap gap-2">
													<span
														className="px-2 py-0.5 rounded-full text-[11px] font-medium border"
														style={{
															backgroundColor: colors.bg,
															borderColor: colors.border,
															color: colors.text,
														}}
													>
														{item.platform}
													</span>
													<span
														className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass(item.status)}`}
													>
														{item.status}
													</span>
												</div>
											</div>
										</div>
									</button>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
