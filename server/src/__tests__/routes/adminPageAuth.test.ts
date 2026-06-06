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

  it('downloads portable backup snapshots with the admin bearer token', () => {
    const html = adminPageHtml();

    expect(html).toContain('async function downloadPortableBackup(filename)');
    expect(html).toContain("headers: { 'Authorization': token }");
    expect(html).toContain("onclick=\"downloadPortableBackup(\\'' + b.filename + '\\')\"");
    expect(html).not.toContain('<a href="/api/admin-status/maps/\' + encodeURIComponent(sn) + \'/portable-backups/\' + encodeURIComponent(b.filename) + \'" download');
  });
});
