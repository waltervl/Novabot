import { describe, expect, it } from 'vitest';
import { adminPageHtml } from '../../routes/adminPage.js';

// Per-device log filtering in the admin Console tab. The logs are already
// SN-tagged (MqttLogEntry.sn); this feature adds a device picker that narrows
// the existing console (live stream + history) to a single device's logs.
describe('per-device log filter (admin Console)', () => {
  const html = adminPageHtml();

  it('renders a device selector in the console with an "all devices" default', () => {
    expect(html).toContain('id="f_device"');
    expect(html).toContain('>All devices<');
  });

  it('re-renders the console when a device is picked', () => {
    // the device <select> triggers a re-render on change
    expect(html).toMatch(/id="f_device"[^>]*onchange="renderLogs\(\)"/);
  });

  it('narrows the log stream to the selected device', () => {
    expect(html).toContain('function matchesDevice(');
    // applied in the filter pipeline (full re-render + live append + copy)
    expect(html).toContain('if (!matchesDevice(');
  });

  it('populates the device selector from the device list', () => {
    expect(html).toContain('function populateDeviceFilter(');
    expect(html).toContain('populateDeviceFilter(');
  });
});
