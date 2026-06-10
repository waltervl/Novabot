import { useEffect, useRef, useState } from 'react';
import { installer } from '../ipc';

interface FinishStepProps {
  /** The hostname the user configured; the Pi advertises it as `<hostname>.local`. */
  hostname?: string;
}

export function FinishStep({ hostname }: FinishStepProps) {
  const mdnsHost = hostname && hostname.trim().length > 0 ? `${hostname.trim()}.local` : 'opennova.local';

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
        <h2 className="text-lg font-semibold">Almost done</h2>
        <p className="text-sm text-slate-600">
          Put the microSD card in your Raspberry Pi and power it on. The first boot
          can take a few minutes while it sets itself up.
        </p>
      </div>

      {foundHost ? (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
          <p className="text-sm font-medium text-emerald-800">Found your Pi.</p>
          <button
            type="button"
            onClick={() => openAdmin(foundHost)}
            className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Open admin
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <span>
              Waiting for <span className="font-medium">{mdnsHost}</span> to come online…
            </span>
          </div>

          <div className="space-y-2">
            <label htmlFor="pi-ip" className="block text-sm font-medium text-slate-700">
              Know your Pi&apos;s IP? Open it directly
            </label>
            <div className="flex gap-2">
              <input
                id="pi-ip"
                type="text"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                placeholder="192.168.1.50"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
              />
              <button
                type="button"
                disabled={!manualIpValid}
                onClick={() => openAdmin(manualIp.trim())}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Open admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
