import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { adminPageHtml } from '../../routes/adminPage.js';

describe('coverage preview UI', () => {
  it('adds an admin map-viewer control that calls the stock mower preview route', () => {
    const html = adminPageHtml();

    expect(html).toContain('id="nativeCoverageBtn"');
    expect(html).toContain('id="nativeCoverageRadius"');
    expect(html).toContain('async function saveCoveragePlannerRadius()');
    expect(html).toContain("'/api/dashboard/coverage-planner-radius/' + encodeURIComponent(sn)");
    expect(html).toContain('async function runNativeCoveragePreview()');
    expect(html).toContain("'/api/dashboard/refresh-preview-path/' + encodeURIComponent(sn)");
    expect(html).toContain('Mower coverage preview');
    expect(html).not.toContain("'/api/dashboard/native-preview-path/' + encodeURIComponent(sn)");
    expect(html).not.toContain('runNativeCoveragePreview() {\\n  publishToDevice');
  });

  it('uses stock mower preview from the dashboard map toolbar instead of native generation', async () => {
    const source = await readFile(
      new URL('../../../../dashboard/src/components/map/MowerMap.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('refreshPreviewPath');
    expect(source).toContain('previewMapIdsFromCanonicals');
    expect(source).toContain('await refreshPreviewPath(sn,');
    expect(source).not.toContain('nativePreviewPath');
    expect(source).not.toContain('await nativePreviewPath(sn,');
    expect(source).not.toContain('Server-side native coverage preview');
  });

  it('uses stock mower preview from the OpenNova start sheet', async () => {
    const source = await readFile(
      new URL('../../../../app/src/components/StartMowSheet.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('previewMapIdsFromMaps');
    expect(source).toContain('api.refreshPreviewPath(sn,');
    expect(source).toContain('onPreviewPaths?.(paths)');
  });
});
