import { describe, expect, it } from 'vitest';
import { appendApprovalSaveSearchParams, approvalSaveRedirectQuery, runApprovalSave } from '../approvalSaveAction';
import { AgentError } from '../errors';

describe('approvalSaveAction', () => {
	it('returns success query on ok outcome', () => {
		expect(approvalSaveRedirectQuery({ ok: true })).toEqual({ saved: '1' });
		expect(appendApprovalSaveSearchParams('/approve/tok', { ok: true })).toBe('/approve/tok?saved=1');
	});

	it('returns error query on failure outcome', () => {
		expect(approvalSaveRedirectQuery({ ok: false, message: 'Nope' })).toEqual({ error: 'Nope' });
		expect(appendApprovalSaveSearchParams('/approvals/id', { ok: false, message: 'Nope' })).toBe(
			'/approvals/id?error=Nope',
		);
	});

	it('runApprovalSave maps AgentError to message without throwing', async () => {
		const outcome = await runApprovalSave(async () => {
			throw new AgentError('invalid_input', 'Bad body', 400);
		});
		expect(outcome).toEqual({ ok: false, message: 'Bad body' });
	});

	it('runApprovalSave returns value on success', async () => {
		const outcome = await runApprovalSave(async () => ({ id: 'req-1' }));
		expect(outcome).toEqual({ ok: true, value: { id: 'req-1' } });
	});
});
