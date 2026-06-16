import { describe, expect, it } from 'vitest';
import { adminPageHtml } from '../../routes/adminPage.js';

// Regression for the "empty Server Console" report: the admin console connected
// its log socket with a bare `io()` (no token). socketHandler's external auth
// gate (io.use) rejects a tokenless handshake from a public address with a 400,
// so no live `mqtt:log` events arrive and the console stays empty. The fix
// passes the admin JWT in the handshake auth, consumes the server's connect-time
// backlog push, authenticates the REST fallback, and reconnects after login.
describe('admin Server Console socket wiring', () => {
  const html = adminPageHtml();

  it('connects the log socket with the admin JWT in the handshake auth', () => {
    expect(html).toContain('function connectMqttSocket()');
    expect(html).toContain('var opts = token ? { auth: { token: token } } : {};');
    expect(html).toContain('mqttSocket = io(opts);');
    // The explicit-port fallback connect must also carry opts.
    expect(html).toMatch(/location\.hostname \+ ':\d+', opts\)/);
    // The old tokenless connects must be gone.
    expect(html).not.toContain('mqttSocket = io();');
  });

  it('consumes the server connect-time log backlog instead of only requesting it', () => {
    expect(html).toContain("sock.on('mqtt:log:history', function(logs)");
    expect(html).toContain('mqttLogs = logs.slice(-MAX_CONSOLE_LINES);');
    // The old fire-and-forget request (no handler either side) must be gone.
    expect(html).not.toContain("sock.emit('mqtt:log:history')");
  });

  it('authenticates the REST backlog fallback fetch', () => {
    expect(html).toContain(
      "fetch('/api/dashboard/mqtt-logs', token ? { headers: { 'Authorization': token } } : {})",
    );
  });

  it('reconnects the socket after a fresh login so the console fills', () => {
    expect(html).toContain('Reconnect the log socket with the fresh token');
    // The reconnect call lives in the login success branch, after showApp().
    const loginIdx = html.indexOf('async function doLogin()');
    const showAppIdx = html.indexOf('showApp();', loginIdx);
    const reconnectIdx = html.indexOf('connectMqttSocket();', showAppIdx);
    expect(loginIdx).toBeGreaterThanOrEqual(0);
    expect(showAppIdx).toBeGreaterThan(loginIdx);
    expect(reconnectIdx).toBeGreaterThan(showAppIdx);
  });
});
