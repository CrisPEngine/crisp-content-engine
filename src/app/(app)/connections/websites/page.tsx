'use client';

import { useEffect, useState } from 'react';

type Destination = {
	id: string;
	name: string;
	cmsType: string;
	connected: boolean;
	health: string;
	taxonomyAvailable: boolean;
	draftSubmission: boolean;
	publishing: boolean;
	publishingNote: string;
	lastSyncAt: string | null;
	error: string | null;
	taxonomy: { categories: Array<{ id: string; name: string }>; contentTypes: string[]; tools: Array<{ slug: string; label: string }> } | null;
};

export default function WebsitesPage() {
	const [destinations, setDestinations] = useState<Destination[]>([]);
	const [message, setMessage] = useState('');

	useEffect(() => {
		void fetch('/api/websites')
			.then((response) => response.json())
			.then((body) => {
				if (body.error) {
					setMessage('Sign in to see website connections.');
					return;
				}
				setDestinations(Array.isArray(body.destinations) ? body.destinations : []);
			})
			.catch(() => setMessage('Sign in to see website connections.'));
	}, []);

	return (
		<div className="mx-auto max-w-4xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Websites & CMS</h1>
				<p className="text-text-soft">Destinations are adapters. The editorial workspace stays the same when another CMS is added.</p>
			</div>
			{message ? <p className="text-sm">{message}</p> : null}
			{destinations.map((destination) => (
				<article key={destination.id} className="card p-4 space-y-2">
					<h2 className="text-lg font-medium">{destination.name}</h2>
					<p className="text-sm">CMS: {destination.cmsType}</p>
					<p className="text-sm">Connection: {destination.connected ? destination.health : 'disconnected'}</p>
					<p className="text-sm">Taxonomy: {destination.taxonomyAvailable ? `${destination.taxonomy?.categories.length ?? 0} categories` : 'unavailable'}</p>
					<p className="text-sm">Draft submission: {destination.draftSubmission ? 'available' : 'unavailable'}</p>
					<p className="text-sm">Publishing: {destination.publishing ? 'privileged flag on' : 'off'}</p>
					<p className="text-sm">{destination.publishingNote}</p>
					<p className="text-sm">Last taxonomy sync: {destination.lastSyncAt ? new Date(destination.lastSyncAt).toLocaleString() : '—'}</p>
					{destination.error ? <p className="text-sm">{destination.error}</p> : null}
					{destination.taxonomy ? (
						<ul className="text-sm list-disc pl-5">
							{destination.taxonomy.categories.map((category) => <li key={category.id}>{category.name}</li>)}
						</ul>
					) : null}
				</article>
			))}
		</div>
	);
}
