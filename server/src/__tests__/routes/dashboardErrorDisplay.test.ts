import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// The desktop dashboard (DashboardShell) must surface device errors/warnings.
// Regression guard: the DashboardPage→DashboardShell refactor (1f59a59f) dropped
// the <MowerStatus> mount that hosted <ErrorDisplay>, so error/warning popups no
// longer reached the desktop dashboard (only the mobile MobilePage kept it).
// This pins the error/warning display back into the shell.
describe('desktop dashboard surfaces device errors/warnings', () => {
  it('mounts ErrorDisplay in DashboardShell, fed from the active mower sensors', async () => {
    const src = await readFile(
      new URL('../../../../dashboard/src/shell/DashboardShell.tsx', import.meta.url),
      'utf8',
    );

    // Imported and actually rendered (not just referenced in a comment).
    expect(src).toContain('ErrorDisplay');
    expect(src).toMatch(/<ErrorDisplay/);

    // Fed from the active mower's raw sensor error fields.
    expect(src).toContain('error_status');
    expect(src).toContain('error_code');
  });
});
