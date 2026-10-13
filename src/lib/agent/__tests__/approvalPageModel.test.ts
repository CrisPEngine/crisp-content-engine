import { describe, expect, it } from 'vitest';
import { resolveApprovalDisplayBody } from '../approvalPageModel';

describe('resolveApprovalDisplayBody', () => {
	it('prefers the canonical stored body over a truncated approval preview', () => {
		const preview = 'x'.repeat(1200);
		const stored = `${'Paragraph. '.repeat(200)}Done.`;
		expect(resolveApprovalDisplayBody({ previewBody: preview, sourceBody: stored })).toBe(stored);
	});

	it('falls back to preview text when no stored body is available', () => {
		expect(resolveApprovalDisplayBody({ previewBody: 'Draft text', previewExcerpt: 'Excerpt' })).toBe('Draft text');
	});
});
