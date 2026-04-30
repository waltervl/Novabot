import { useEffect, useState } from 'react';
import { fetchSystemLogs, type SystemLogEntry } from '../../api/client';

const TYPES = ['all', 'connect', 'disconnect', 'subscribe', 'publish', 'error', 'forward'] as const;
type FilterType = typeof TYPES[number];

export function ServerLogTail() {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fresh = await fetchSystemLogs({
          tail: 200,
          type: filter === 'all' ? undefined : filter,
        });
        if (!cancelled) {
          setLogs(fresh);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load failed');
      }
    }
    load();
    const id = setInterval(load, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [filter]);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-zinc-300">Server log</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterType)}
          className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-200"
        >
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">Failed: {error}</p>}

      <div className="bg-zinc-950 rounded border border-zinc-800 max-h-72 overflow-y-auto p-2 font-mono text-[10px] text-zinc-400">
        {logs.length === 0 ? (
          <p className="text-zinc-600 italic">— empty —</p>
        ) : logs.map((l, i) => (
          <div key={`${l.ts}-${i}`} className="py-0.5 border-b border-zinc-900 last:border-b-0">
            <span className="text-zinc-600">{new Date(l.ts).toISOString().slice(11, 19)}</span>
            <span className="text-zinc-500 mx-1">[{l.type}]</span>
            {l.sn && <span className="text-zinc-500">{l.sn} </span>}
            <span className="text-zinc-300">{l.topic}</span>
            {l.payload && (
              <span className="text-zinc-600 ml-1">
                {l.payload.length > 80 ? l.payload.slice(0, 80) + '…' : l.payload}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
