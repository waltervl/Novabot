import { useState } from 'react';
import { Tag, Bell, Check, Loader2, Smartphone, Radio, Home as HomeIcon, Mail, Scissors, Ruler, Compass, ArrowUp, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DeviceState } from '../types';
import { updateMowerNickname } from '../api/client';
import { readMowDefaults, writeMowDefaults, type MowDefaults } from '../utils/mowDefaults';

interface Props {
  mower: DeviceState | null;
}

export function SettingsPage({ mower }: Props) {
  const { t } = useTranslation();
  if (!mower) {
    return <div className="p-8 text-zinc-500">{t('pages.selectMower')}</div>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <NicknameCard mower={mower} />
        <MowingDefaultsCard />
        <NotificationsCard />
      </div>
    </div>
  );
}

// ── Shared card shell ────────────────────────────────────────────────────────

function SettingCard({
  icon: Icon,
  title,
  help,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-emerald-400" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">{title}</span>
      </div>
      {help && <p className="text-xs text-zinc-500 mb-3 leading-relaxed">{help}</p>}
      {children}
    </div>
  );
}

function NicknameCard({ mower }: { mower: DeviceState }) {
  const { t } = useTranslation();
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
      setError(err instanceof Error ? err.message : t('common.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingCard icon={Tag} title={t('settings.nickname.title')} help={t('settings.nickname.help')}>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={mower.sn}
          className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? t('settings.nickname.saving') : t('settings.nickname.save')}
        </button>
      </div>
      {error && <div className="mt-2 text-red-400 text-xs">{error}</div>}
      {savedAt && !error && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-emerald-400 text-xs">
          <Check className="w-3.5 h-3.5" />{t('settings.nickname.saved')}
        </div>
      )}
    </SettingCard>
  );
}

function MowingDefaultsCard() {
  const { t } = useTranslation();
  const [defs, setDefs] = useState<MowDefaults>(() => readMowDefaults());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const update = (patch: Partial<MowDefaults>) => {
    setDefs(prev => {
      const next = { ...prev, ...patch };
      writeMowDefaults(next);
      return next;
    });
    setSavedAt(Date.now());
  };

  const cm = Math.round(defs.cuttingHeight / 10);
  const stepBtn = 'grid place-items-center w-9 h-9 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-40';
  const slider = 'w-full h-1.5 accent-emerald-500 bg-gray-700 rounded-full appearance-none cursor-pointer';

  return (
    <SettingCard icon={Scissors} title={t('settings.mowDefaults.title', 'Mowing defaults')} help={t('settings.mowDefaults.help', 'Pre-fills the Start sheet, so you do not reset these every mow.')}>
      {/* Cutting height */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500">
            <Ruler className="w-3.5 h-3.5" />{t('settings.mowDefaults.cuttingHeight', 'Cutting height')}
          </span>
          <span className="font-mono text-sm font-semibold text-white tabular-nums">{cm} cm</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => update({ cuttingHeight: Math.max(20, defs.cuttingHeight - 10) })} disabled={defs.cuttingHeight <= 20} className={stepBtn}><Minus className="w-4 h-4" /></button>
          <input type="range" min={20} max={90} step={10} value={defs.cuttingHeight} onChange={e => update({ cuttingHeight: parseInt(e.target.value) })} className={slider} />
          <button onClick={() => update({ cuttingHeight: Math.min(90, defs.cuttingHeight + 10) })} disabled={defs.cuttingHeight >= 90} className={stepBtn}><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Default mowing direction */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500">
            <Compass className="w-3.5 h-3.5" />{t('settings.mowDefaults.direction', 'Default direction')}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-white tabular-nums">
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400 transition-transform" style={{ transform: `rotate(${defs.pathDirection}deg)` }} />
            {defs.pathDirection}&deg;
          </span>
        </div>
        <input type="range" min={0} max={180} step={5} value={defs.pathDirection} onChange={e => update({ pathDirection: parseInt(e.target.value) })} className={slider} />
      </div>

      {savedAt && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-emerald-400 text-xs">
          <Check className="w-3.5 h-3.5" />{t('settings.mowDefaults.saved', 'Saved')}
        </div>
      )}
    </SettingCard>
  );
}

function NotificationsCard() {
  const { t } = useTranslation();
  const items: Array<{ icon: React.ComponentType<{ className?: string }>; label: string }> = [
    { icon: Smartphone, label: t('settings.notifications.push') },
    { icon: Radio, label: t('settings.notifications.ntfy') },
    { icon: HomeIcon, label: t('settings.notifications.ha') },
    { icon: Mail, label: t('settings.notifications.email') },
  ];
  return (
    <SettingCard icon={Bell} title={t('settings.notifications.title')} help={t('settings.notifications.help')}>
      <ul className="space-y-2">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/60 rounded-xl px-3 py-2.5">
            <span className="inline-flex items-center gap-2.5 text-sm text-zinc-200">
              <Icon className="w-4 h-4 text-gray-500" />
              {label}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-500 border border-gray-600/40">
              {t('settings.notifications.comingSoon')}
            </span>
          </li>
        ))}
      </ul>
    </SettingCard>
  );
}
