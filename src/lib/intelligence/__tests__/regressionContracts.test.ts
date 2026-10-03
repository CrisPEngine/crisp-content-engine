import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSidecarLlmModel } from '@/lib/llm';
import { publishToLinkedIn, refreshLinkedInToken } from '@/lib/linkedin/publish';
import { listRecords } from '@/lib/airtable/client';
import { generateSidecarDraft } from '@/lib/sidecar/draft';
import { INTELLIGENCE_ACTION_NAMES } from '../actions';

const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
	return readFileSync(path.join(root, rel), 'utf8');
}

describe('critical journey regression contracts', () => {
	it('does not remove Make generation webhooks from the live content generate route', () => {
		const src = read('src/app/api/content/generate/route.ts');
		expect(src).toContain('MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL');
		expect(src).toContain('MAKE_WEBHOOK_STARTER');
	});

	it('keeps strategy generation on Make', () => {
		const src = read('src/app/api/strategy/generate/route.ts');
		expect(src).toContain('MAKE_STRATEGY_WEBHOOK_URL');
	});

	it('keeps Airtable BrandProfiles and ContentQueue as the live CMS', () => {
		expect(read('src/app/api/brands/route.ts')).toContain('AIRTABLE_BRANDPROFILES_TABLE');
		expect(read('src/app/api/content/queue/route.ts')).toMatch(/AIRTABLE_CONTENTQUEUE_TABLE|AIRTABLE_/);
		expect(typeof listRecords).toBe('function');
	});

	it('keeps native LinkedIn publishing entry points', () => {
		expect(typeof publishToLinkedIn).toBe('function');
		expect(typeof refreshLinkedInToken).toBe('function');
		expect(read('src/app/api/publish/linkedin-due/route.ts')).toContain('CRON_SECRET');
	});

	it('keeps Sidecar draft generation as a server-side function', () => {
		expect(typeof generateSidecarDraft).toBe('function');
		expect(resolveSidecarLlmModel()).toBeTruthy();
		expect(read('src/lib/sidecar/draft.ts')).toContain("completeWithRole");
		expect(read('src/lib/sidecar/draft.ts')).toContain("'SIDECAR'");
	});

	it('keeps approval and Idea Engine routes intact', () => {
		expect(read('src/app/api/content/queue/[contentId]/route.ts')).toMatch(/approve/);
		expect(read('src/app/api/idea-engine/run/route.ts')).toMatch(/idea.engine|run/i);
	});

	it('exposes MCP-ready intelligence actions without replacing operator Make adapters', () => {
		expect(INTELLIGENCE_ACTION_NAMES).toContain('draft_content');
		expect(INTELLIGENCE_ACTION_NAMES).toContain('publish_content');
		expect(INTELLIGENCE_ACTION_NAMES).toContain('execute_theme_plan');
		expect(INTELLIGENCE_ACTION_NAMES).toContain('publish_article');
		expect(read('src/lib/operator/adapters/make.ts')).toContain('MAKE_');
		expect(read('src/app/api/publish/linkedin-due/route.ts')).toContain('CRON_SECRET');
		expect(read('src/app/api/intelligence/jobs/process/route.ts')).toContain('getDefaultJobHandlers');
		expect(read('src/app/api/intelligence/diagnostics/route.ts')).toContain('runProductionSmoke');
	});
});
