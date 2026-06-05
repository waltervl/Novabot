import { describe, expect, it } from 'vitest';
import { adminPageHtml } from '../../routes/adminPage.js';

describe('admin page session handling', () => {
  it('does not treat JSON auth failures as empty device side-data', () => {
    const html = adminPageHtml();

    expect(html).toContain('function isAuthFailurePayload(d)');
    expect(html).toContain('async function fetchJsonAuth');
    expect(html).toContain("fetchJsonAuth('/api/dashboard/lora/pending'");
    expect(html).toContain("fetchJsonAuth('/api/admin-status/banned-devices'");
    expect(html).not.toContain('r.ok ? r.json() : { ok: false, pending: [] }');
    expect(html).not.toContain('r.ok ? r.json() : { banned: [] }');
  });
});
