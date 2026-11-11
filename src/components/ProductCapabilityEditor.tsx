'use client';

import { useState } from 'react';
import { CAPABILITY_AVAILABILITY, type CapabilityAvailability, type ProductCapability } from '@/lib/articles/productKnowledge';

function readCapabilities(knowledgeJson: string): { knowledge: Record<string, unknown>; capabilities: ProductCapability[] } {
	try {
		const knowledge = JSON.parse(knowledgeJson) as Record<string, unknown>;
		const capabilities = Array.isArray(knowledge.capabilities) ? (knowledge.capabilities as ProductCapability[]) : [];
		return { knowledge, capabilities };
	} catch {
		return { knowledge: {}, capabilities: [] };
	}
}

export function ProductCapabilityEditor({ knowledgeJson, onKnowledge }: { knowledgeJson: string; onKnowledge: (value: string) => void }) {
	const { knowledge, capabilities } = readCapabilities(knowledgeJson);
	const [draft, setDraft] = useState({ name: '', description: '', availability: 'unverified' as CapabilityAvailability, evidence: '', productUrl: '', prohibited: '' });
	function write(next: ProductCapability[]) {
		onKnowledge(JSON.stringify({ ...knowledge, capabilities: next }, null, 2));
	}
	function update(id: string, patch: Partial<ProductCapability>) {
		write(capabilities.map((item) => (item.id === id ? { ...item, ...patch } : item)));
	}
	return (
		<section className="card p-4 space-y-3 text-sm">
			<div>
				<h2 className="font-medium">Product capabilities</h2>
				<p className="text-text-soft">Available and beta claims need evidence and a verification date before an article can state them as current. Planned work stays planned.</p>
			</div>
			{capabilities.map((item) => (
				<div key={item.id} className="border-t border-edge/50 pt-3 space-y-2">
					<div className="flex flex-wrap gap-2 items-center">
						<input className="input" value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} />
						<select className="input" value={item.availability} onChange={(event) => update(item.id, { availability: event.target.value as CapabilityAvailability })}>
							{CAPABILITY_AVAILABILITY.map((state) => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
						</select>
					</div>
					<textarea className="input w-full" rows={2} value={item.description} onChange={(event) => update(item.id, { description: event.target.value })} />
					<input className="input w-full" placeholder="Evidence" value={item.evidence ?? ''} onChange={(event) => update(item.id, { evidence: event.target.value })} />
					<input className="input w-full" placeholder="Product URL" value={item.productUrl ?? ''} onChange={(event) => update(item.id, { productUrl: event.target.value })} />
					<input className="input w-full" placeholder="Prohibited claims, separated by commas" value={(item.prohibitedClaims ?? []).join(', ')} onChange={(event) => update(item.id, { prohibitedClaims: event.target.value.split(',').map((part) => part.trim()).filter(Boolean) })} />
					<p className="text-xs text-text-soft">{item.lastVerified ? `Verified ${item.lastVerified}` : 'Not verified'}</p>
					<div className="flex flex-wrap gap-2">
						<button
							className="btn"
							type="button"
							onClick={() => update(item.id, { lastVerified: new Date().toISOString().slice(0, 10), availability: item.availability === 'unverified' ? 'available' : item.availability })}
							disabled={!item.evidence?.trim()}
						>
							Verify
						</button>
						<button className="btn" type="button" onClick={() => update(item.id, { availability: 'deprecated', lastVerified: null })}>Retire</button>
					</div>
				</div>
			))}
			<div className="border-t border-edge/50 pt-3 grid gap-2">
				<input className="input" placeholder="Capability name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
				<textarea className="input w-full" rows={2} placeholder="What it does" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
				<select className="input" value={draft.availability} onChange={(event) => setDraft({ ...draft, availability: event.target.value as CapabilityAvailability })}>
					{CAPABILITY_AVAILABILITY.map((state) => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
				</select>
				<input className="input" placeholder="Evidence" value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} />
				<input className="input" placeholder="Product URL" value={draft.productUrl} onChange={(event) => setDraft({ ...draft, productUrl: event.target.value })} />
				<input className="input" placeholder="Prohibited claims" value={draft.prohibited} onChange={(event) => setDraft({ ...draft, prohibited: event.target.value })} />
				<button
					className="btn"
					type="button"
					disabled={!draft.name.trim()}
					onClick={() => {
						write([
							...capabilities,
							{
								id: `capability-${capabilities.length + 1}-${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
								name: draft.name.trim(),
								description: draft.description.trim(),
								availability: draft.availability,
								evidence: draft.evidence.trim() || undefined,
								productUrl: draft.productUrl.trim() || undefined,
								prohibitedClaims: draft.prohibited.split(',').map((part) => part.trim()).filter(Boolean),
							},
						]);
						setDraft({ name: '', description: '', availability: 'unverified', evidence: '', productUrl: '', prohibited: '' });
					}}
				>
					Add capability
				</button>
			</div>
			<p className="text-xs text-text-soft">Save Brand Brain to keep these changes. Saving does not publish any article.</p>
		</section>
	);
}
