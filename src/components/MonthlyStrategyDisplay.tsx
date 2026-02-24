'use client';

/**
 * MonthlyStrategyDisplay
 *
 * Renders the result_payload JSON from StrategyUpdates
 * (Airtable field flddd613pjtMNXs0h) in a fully human-readable format.
 *
 * Expected structure:
 *   { monthly_strategy: { objective, themes[], core_messaging, pillars[{name,why}], ... } }
 *
 * Handles extra top-level keys gracefully.
 */

type MonthlyStrategyDisplayProps = {
	resultPayload: any;
};

const get = (obj: any, ...keys: string[]): any => {
	if (!obj) return undefined;
	for (const k of keys) {
		const v = obj[k];
		if (v !== undefined && v !== null && v !== '') return v;
	}
	return undefined;
};

const toArr = (v: any): any[] => (Array.isArray(v) ? v : []);

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
	return (
		<section className="space-y-3">
			<h4 className="flex items-center gap-2 text-sm font-semibold text-text border-b border-edge/60 pb-2">
				<span className="text-base leading-none">{icon}</span>
				{title}
			</h4>
			{children}
		</section>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	if (!value) return null;
	return (
		<div>
			{label && <div className="text-xs font-medium text-text-dim uppercase tracking-wide mb-1">{label}</div>}
			<p className="text-sm text-text leading-relaxed whitespace-pre-line">{value}</p>
		</div>
	);
}

function TagList({ items }: { items: string[] }) {
	if (!items.length) return null;
	return (
		<div className="flex flex-wrap gap-1.5">
			{items.filter(Boolean).map((item, i) => (
				<span key={i} className="inline-block text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary">
					{item}
				</span>
			))}
		</div>
	);
}

export function MonthlyStrategyDisplay({ resultPayload }: MonthlyStrategyDisplayProps) {
	if (!resultPayload) return null;

	let payload: any;
	if (typeof resultPayload === 'string') {
		try { payload = JSON.parse(resultPayload); } catch { return <p className="text-sm text-text-dim">Unable to parse strategy content.</p>; }
	} else {
		payload = resultPayload;
	}

	const ms = payload?.monthly_strategy || payload;

	const objective = get(ms, 'objective', 'Objective');
	const themes = toArr(ms?.themes).filter(Boolean);
	const coreMessaging = get(ms, 'core_messaging', 'Core messaging', 'core_message');
	const pillars = toArr(ms?.pillars || ms?.content_pillars);
	const platforms = toArr(ms?.platforms);
	const contentTypes = toArr(ms?.content_types);
	const keyMessages = toArr(ms?.key_messages);
	const callToAction = get(ms, 'call_to_action', 'cta');
	const tone = get(ms, 'tone', 'tone_guidance');
	const notes = get(ms, 'notes', 'additional_notes', 'special_instructions');

	const hasContent = objective || themes.length || coreMessaging || pillars.length || platforms.length || contentTypes.length || keyMessages.length || callToAction || tone || notes;

	if (!hasContent) {
		return (
			<div className="text-sm text-text-dim italic p-3">
				Strategy content is processing — check back shortly.
			</div>
		);
	}

	return (
		<div className="space-y-4 pt-2">
			{/* Objective */}
			{objective && (
				<Section title="Monthly Objective" icon="🎯">
					<Field label="" value={objective} />
				</Section>
			)}

			{/* Themes */}
			{themes.length > 0 && (
				<Section title="Key Themes" icon="💡">
					<TagList items={themes} />
				</Section>
			)}

			{/* Core Messaging */}
			{coreMessaging && (
				<Section title="Core Messaging" icon="💬">
					<Field label="" value={coreMessaging} />
				</Section>
			)}

			{/* Content Pillars */}
			{pillars.length > 0 && (
				<Section title="Content Pillars This Month" icon="🏛️">
					<div className="space-y-2">
						{pillars.map((p: any, i: number) => {
							const name = get(p, 'name', 'Name', 'title') || `Pillar ${i + 1}`;
							const why = get(p, 'why', 'description', 'Why', 'rationale');
							const formats = toArr(p.content_formats || p.formats).filter(Boolean);
							return (
								<div key={i} className="flex items-start gap-3 p-3 rounded-xl2 border border-edge/60 bg-surface/20">
									<span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
										{i + 1}
									</span>
									<div className="space-y-1 min-w-0">
										<p className="text-sm font-medium text-text">{name}</p>
										{why && <p className="text-xs text-text-soft leading-relaxed">{why}</p>}
										{formats.length > 0 && (
											<div className="flex flex-wrap gap-1 pt-0.5">
												{formats.map((f: string, j: number) => (
													<span key={j} className="text-xs px-2 py-0.5 rounded-full border border-edge/60 text-text-dim">{f}</span>
												))}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</Section>
			)}

			{/* Key Messages */}
			{keyMessages.length > 0 && (
				<Section title="Key Messages" icon="📢">
					<ul className="space-y-1.5">
						{keyMessages.map((m: string, i: number) => (
							<li key={i} className="flex items-start gap-2 text-sm text-text">
								<span className="text-primary mt-0.5">•</span>
								<span className="leading-relaxed">{m}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{/* Platforms */}
			{platforms.length > 0 && (
				<Section title="Platforms" icon="📱">
					<TagList items={platforms} />
				</Section>
			)}

			{/* Content Types */}
			{contentTypes.length > 0 && (
				<Section title="Content Types" icon="📝">
					<TagList items={contentTypes} />
				</Section>
			)}

			{/* Tone */}
			{tone && (
				<Section title="Tone Guidance" icon="🎙️">
					<Field label="" value={tone} />
				</Section>
			)}

			{/* Call to Action */}
			{callToAction && (
				<Section title="Call to Action" icon="👆">
					<Field label="" value={callToAction} />
				</Section>
			)}

			{/* Additional Notes */}
			{notes && (
				<Section title="Additional Notes" icon="📋">
					<Field label="" value={notes} />
				</Section>
			)}
		</div>
	);
}
