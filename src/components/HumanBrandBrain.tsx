'use client';

import type { ReactNode } from 'react';

type Section = Record<string, unknown>;

function lines(value: unknown): string {
	return Array.isArray(value) ? value.map(String).join('\n') : '';
}

function fromLines(value: string): string[] {
	return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export function HumanBrandBrain({
	identityJson,
	voiceJson,
	guardrailsJson,
	knowledgeJson,
	onIdentity,
	onVoice,
	onGuardrails,
	onKnowledge,
}: {
	identityJson: string;
	voiceJson: string;
	guardrailsJson: string;
	knowledgeJson: string;
	onIdentity: (value: string) => void;
	onVoice: (value: string) => void;
	onGuardrails: (value: string) => void;
	onKnowledge: (value: string) => void;
}) {
	const identity = parse(identityJson);
	const voice = parse(voiceJson);
	const guardrails = parse(guardrailsJson);
	const knowledge = parse(knowledgeJson);

	function update(current: Section, key: string, value: unknown, write: (next: string) => void) {
		write(JSON.stringify({ ...current, [key]: value }, null, 2));
	}

	return (
		<div className="space-y-4">
			<Card title="Overview">
				<Field label="Brand name" value={text(identity.name)} onChange={(value) => update(identity, 'name', value, onIdentity)} />
				<Field label="Website" value={text(identity.website)} onChange={(value) => update(identity, 'website', value, onIdentity)} />
				<Field label="Description" value={text(identity.description)} onChange={(value) => update(identity, 'description', value, onIdentity)} />
				<Field label="Mission" value={text(identity.mission)} onChange={(value) => update(identity, 'mission', value, onIdentity)} />
				<Field label="Purpose" value={text(identity.purpose)} onChange={(value) => update(identity, 'purpose', value, onIdentity)} />
				<Field label="Positioning" value={text(identity.positioning)} onChange={(value) => update(identity, 'positioning', value, onIdentity)} />
			</Card>
			<Card title="Audience">
				<Area label="Audiences" value={lines(identity.audiences)} onChange={(value) => update(identity, 'audiences', fromLines(value), onIdentity)} />
			</Card>
			<Card title="Products and services">
				<Area label="One per line" value={lines(identity.productsServices)} onChange={(value) => update(identity, 'productsServices', fromLines(value), onIdentity)} />
			</Card>
			<Card title="Voice">
				<Field label="Tone" value={text(voice.tone)} onChange={(value) => update(voice, 'tone', value, onVoice)} />
				<Field label="Personality" value={text(voice.personality)} onChange={(value) => update(voice, 'personality', value, onVoice)} />
				<Field label="Formality" value={text(voice.formality)} onChange={(value) => update(voice, 'formality', value, onVoice)} />
				<Field label="Point of view" value={text(voice.pointOfView)} onChange={(value) => update(voice, 'pointOfView', value, onVoice)} />
				<Field label="Humour" value={text(voice.humour)} onChange={(value) => update(voice, 'humour', value, onVoice)} />
				<Field label="Pacing" value={text(voice.pacing)} onChange={(value) => update(voice, 'pacing', value, onVoice)} />
			</Card>
			<Card title="Messaging">
				<Area label="Differentiators" value={lines(identity.differentiators)} onChange={(value) => update(identity, 'differentiators', fromLines(value), onIdentity)} />
			</Card>
			<Card title="Proof and facts">
				<Area label="Confirmed facts" value={lines(knowledge.brandFacts)} onChange={(value) => update(knowledge, 'brandFacts', fromLines(value), onKnowledge)} />
				<Area label="Proof points" value={lines(knowledge.proofPoints)} onChange={(value) => update(knowledge, 'proofPoints', fromLines(value), onKnowledge)} />
			</Card>
			<Card title="Guardrails">
				<Area label="Required" value={lines(guardrails.requiredTerminology)} onChange={(value) => update(guardrails, 'requiredTerminology', fromLines(value), onGuardrails)} />
				<Area label="Avoid" value={lines(guardrails.phrasesToAvoid)} onChange={(value) => update(guardrails, 'phrasesToAvoid', fromLines(value), onGuardrails)} />
				<Area label="Prohibited" value={lines(guardrails.prohibitedClaims)} onChange={(value) => update(guardrails, 'prohibitedClaims', fromLines(value), onGuardrails)} />
			</Card>
			<details className="card p-4">
				<summary className="cursor-pointer text-sm font-medium">Advanced — raw JSON</summary>
				<div className="mt-3 space-y-3">
					<Area label="Identity" value={identityJson} onChange={onIdentity} />
					<Area label="Voice" value={voiceJson} onChange={onVoice} />
					<Area label="Guardrails" value={guardrailsJson} onChange={onGuardrails} />
					<Area label="Knowledge" value={knowledgeJson} onChange={onKnowledge} />
				</div>
			</details>
		</div>
	);
}

function parse(value: string): Section {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function Card({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="card p-4 space-y-3">
			<h2 className="font-medium">{title}</h2>
			{children}
		</section>
	);
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	return (
		<label className="block text-sm">
			<span className="text-text-soft">{label}</span>
			<input className="mt-1 w-full rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
		</label>
	);
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	return (
		<label className="block text-sm">
			<span className="text-text-soft">{label}</span>
			<textarea className="mt-1 w-full min-h-24 rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
		</label>
	);
}
