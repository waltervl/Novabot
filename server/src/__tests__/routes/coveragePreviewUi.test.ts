import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { adminPageHtml } from '../../routes/adminPage.js';

describe('native coverage preview UI', () => {
  it('adds an admin map-viewer control that calls the server-side native preview route', () => {
    const html = adminPageHtml();

    expect(html).toContain('id="nativeCoverageBtn"');
    expect(html).toContain('id="nativeCoverageRadius"');
    expect(html).toContain('async function saveCoveragePlannerRadius()');
    expect(html).toContain("'/api/dashboard/coverage-planner-radius/' + encodeURIComponent(sn)");
    expect(html).toContain('async function runNativeCoveragePreview()');
    expect(html).toContain("'/api/dashboard/native-preview-path/' + encodeURIComponent(sn)");
    expect(html).toContain('Native coverage preview');
    expect(html).not.toContain('runNativeCoveragePreview() {\\n  publishToDevice');
  });

  it('uses native preview from the dashboard map toolbar instead of mower preview refresh', async () => {
    const source = await readFile(
      new URL('../../../../dashboard/src/components/map/MowerMap.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('nativePreviewPath');
    expect(source).toContain('await nativePreviewPath(sn,');
    expect(source).toContain('Server-side native coverage preview');
    expect(source).not.toContain('await refreshPreviewPath(sn, { mapIds: 1, covDirection: 0 })');
  });
});
