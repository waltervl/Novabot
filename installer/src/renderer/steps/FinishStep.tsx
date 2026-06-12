import { useEffect, useState } from 'react';
import { installer } from '../ipc';
import { CheckBadge } from './BuildStep';

interface FinishStepProps {
  /** The hostname the user configured; the Pi advertises it as `<hostname>.local`. */
  hostname?: string;
  /** SSH username, when SSH is enabled — shown as a login hint. */
  sshUser?: string;
}

export function FinishStep({ hostname, sshUser }: FinishStepProps) {
  const mdnsHost =
    hostname && hostname.trim().length > 0 ? `${hostname.trim()}.local` : 'opennova.local';

  const [foundHost, setFoundHost] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState('');

  // Auto-detect the Pi: keep polling `<hostname>.local` (resolved via mDNS) for
  // the OpenNova health endpoint until it answers. First boot installs Docker +
  // the container, so this can take a few minutes — we re-arm across timeouts and
  // stop only when found or when the user leaves this step.
  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        const result = await installer.findPi({ hosts: [mdnsHost], timeoutMs: 45000 });
        if (cancelled) return;
        if (result.ok) {
          setFoundHost(result.value.host);
          return;
        }
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [mdnsHost]);

  const openAdmin = (host: string) => void installer.openExternal(`http://${host}/admin`);
  const manualIpValid = /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(manualIp.trim());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display text-3xl text-ink">All set! Boot it up 🎉</h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-dim font-medium">
          Put the microSD card in your Raspberry Pi and switch it on. The first boot sets everything
          up and takes a few minutes, we&apos;ll spot it automatically.
        </p>
      </div>

      {foundHost ? (
        <div className="tile tile-on p-5">
          <div className="flex items-center gap-2 font-bold text-green">
            <CheckBadge /> Your Pi is online · <span className="code">{foundHost}</span>
          </div>
          <button type="button" onClick={() => openAdmin(foundHost)} className="btn-go mt-4">
            Open OpenNova
          </button>
          {sshUser && (
            <p className="mt-4 text-sm font-semibold text-ink-dim">
              SSH: <span className="code">ssh {sshUser}@{foundHost}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="tile p-4">
            <div className="flex items-center gap-2 font-bold text-ink">
              <span
                className="block w-2.5 h-2.5 rounded-full bg-green"
                style={{ animation: 'soft-pulse 1.1s ease-in-out infinite' }}
              />
              Looking for your Pi…
            </div>
            <p className="mt-2 text-sm text-ink-dim font-semibold">
              Waiting for <span className="code">{mdnsHost}</span> to come online.
            </p>
          </div>

          <div>
            <label htmlFor="pi-ip" className="eyebrow block mb-2">
              Know the IP address? Open it directly
            </label>
            <div className="flex gap-2.5">
              <input
                id="pi-ip"
                type="text"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                placeholder="192.168.1.50"
                className="field flex-1"
                spellCheck={false}
              />
              <button
                type="button"
                disabled={!manualIpValid}
                onClick={() => openAdmin(manualIp.trim())}
                className="btn-go shrink-0"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
