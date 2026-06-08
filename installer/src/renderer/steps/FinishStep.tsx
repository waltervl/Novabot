import { useState } from 'react';
import { installer } from '../ipc';

type Phase = 'idle' | 'searching' | 'found' | 'notFound';

export function FinishStep() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [manualIp, setManualIp] = useState('');
  const [foundHost, setFoundHost] = useState<string | null>(null);

  const find = async () => {
    setPhase('searching');
    setFoundHost(null);
    const hosts = ['opennova.local'];
    const ip = manualIp.trim();
    if (ip.length > 0) {
      hosts.push(ip);
    }
    const result = await installer.findPi({ hosts });
    if (result.ok) {
      setFoundHost(result.value.host);
      setPhase('found');
    } else {
      setPhase('notFound');
    }
  };

  const adminUrl = (host: string) => `http://${host}/admin`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Almost done</h2>
        <p className="text-sm text-slate-600">
          Insert the SD into your Pi and power it on. The first boot can take a few
          minutes.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="pi-ip" className="block text-sm font-medium text-slate-700">
          Or enter your Pi&apos;s IP address
        </label>
        <input
          id="pi-ip"
          type="text"
          value={manualIp}
          onChange={(e) => setManualIp(e.target.value)}
          placeholder="192.168.1.50"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </div>

      <button
        type="button"
        onClick={() => void find()}
        disabled={phase === 'searching'}
        className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {phase === 'searching' ? 'Searching...' : 'Find my Pi'}
      </button>

      {phase === 'searching' && (
        <p className="text-sm text-slate-600">
          Looking for your Pi on the network. This can take a minute while it boots.
        </p>
      )}

      {phase === 'found' && foundHost && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
          <p className="text-sm font-medium text-emerald-800">Found your Pi.</p>
          <a
            href={adminUrl(foundHost)}
            target="_blank"
            rel="noreferrer"
            className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Open admin
          </a>
        </div>
      )}

      {phase === 'notFound' && (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1">
          <p>We could not reach the Pi yet. It may still be starting up.</p>
          <p>
            Open{' '}
            <a
              href="http://opennova.local/admin"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:underline"
            >
              http://opennova.local/admin
            </a>{' '}
            in your browser, or your Pi&apos;s IP address.
          </p>
        </div>
      )}
    </div>
  );
}
