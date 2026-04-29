import { useState } from 'react';
import type { DeviceState } from '../types';
import { updateMowerNickname } from '../api/client';

interface Props {
  mower: DeviceState | null;
}

export function SettingsPage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <NicknameCard mower={mower} />
      <NotificationsCard />
    </div>
  );
}

function NicknameCard({ mower }: { mower: DeviceState }) {
  const [draft, setDraft] = useState<string>(mower.nickname ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSave = async () => {
    const trimmed = draft.trim();
    setSaving(true);
    setError(null);
    try {
      await updateMowerNickname(mower.sn, trimmed.length === 0 ? null : trimmed);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-2">Mower nickname</h3>
      <p className="text-xs text-zinc-500 mb-3">
        Shown in the dashboard header and in the mobile app device picker.
        Leave blank to fall back to the serial number.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={mower.sn}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="mt-2 text-red-400 text-xs">{error}</div>}
      {savedAt && !error && <div className="mt-2 text-emerald-400 text-xs">Saved.</div>}
    </div>
  );
}

function NotificationsCard() {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-2">Notifications</h3>
      <p className="text-xs text-zinc-500 mb-3">
        Configure where you want to be notified about mowing events. Server-side
        configuration endpoint lands in a later phase — these channels are
        listed for reference today.
      </p>
      <ul className="space-y-2 text-xs text-zinc-300">
        <li className="flex items-center justify-between bg-zinc-900 rounded px-3 py-2">
          <span>Push (mobile app, Expo)</span>
          <span className="text-zinc-500">Coming soon</span>
        </li>
        <li className="flex items-center justify-between bg-zinc-900 rounded px-3 py-2">
          <span>ntfy</span>
          <span className="text-zinc-500">Coming soon</span>
        </li>
        <li className="flex items-center justify-between bg-zinc-900 rounded px-3 py-2">
          <span>Home Assistant webhook</span>
          <span className="text-zinc-500">Coming soon</span>
        </li>
        <li className="flex items-center justify-between bg-zinc-900 rounded px-3 py-2">
          <span>Email (SMTP)</span>
          <span className="text-zinc-500">Coming soon</span>
        </li>
      </ul>
    </div>
  );
}
