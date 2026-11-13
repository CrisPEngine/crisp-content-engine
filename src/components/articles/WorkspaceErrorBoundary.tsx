'use client';

import { Component, type ReactNode } from 'react';
import Link from 'next/link';

type State = { message: string | null };

/** Keeps a render failure on one article from replacing the whole application with a blank error. */
export class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, State> {
	state: State = { message: null };

	static getDerivedStateFromError(error: Error): State {
		return { message: error.message || 'The article editor could not render this page.' };
	}

	render() {
		if (!this.state.message) return this.props.children;
		return (
			<div className="mx-auto max-w-3xl space-y-3 p-6">
				<h1 className="text-xl font-medium">The article editor hit a problem</h1>
				<p>{this.state.message}</p>
				<p className="text-sm text-text-soft">The saved article was not changed by this display error.</p>
				<div className="flex gap-2">
					<button className="btn" type="button" onClick={() => window.location.reload()}>Reload article</button>
					<Link className="btn" href="/content/articles">Back to articles</Link>
				</div>
			</div>
		);
	}
}
