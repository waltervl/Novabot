import { useState } from 'react';
import { Server, ServerOff, Plus, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BleScanner } from '../components/ble/BleScanner';
import { RainBadge } from './RainBadge';

const LANGS = ['nl', 'en', 'fr', 'de'] as const;

interface Props {
  connected: boolean;
  rainState: 'dry' | 'rain' | 'paused-by-rain' | null;
  onOpenDrawer: () => void;
}

export function Header({ connected, rainState, onOpenDrawer }: Props) {
  const { t, i18n } = useTranslation();
  const [showBle, setShowBle] = useState(false);

  const changeLang = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('lang', lng);
  };

  return (
    <header className="h-12 md:h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-3 md:px-6">
      {/* Left: logo + title */}
      <div className="flex items-center gap-3">
        <img src="/OpenNova.png" alt="OpenNova" className="h-9 w-auto" />
        <span
          className="hidden md:inline text-xl text-gray-300 tracking-widest uppercase"
          style={{ fontFamily: "'Posterama 1919', sans-serif", letterSpacing: '0.2em' }}
        >
          {t('header.dashboard')}
        </span>
      </div>

      {/* Right: add device + lang switcher + server status + rain badge + gear */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Add device */}
        <button
          onClick={() => setShowBle(true)}
          title={t('ble.addDevice')}
          className="grid place-items-center w-8 h-8 rounded-lg text-zinc-400 bg-zinc-800/50 border border-zinc-700/70 hover:text-emerald-400 hover:border-emerald-500/60 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Language switcher — segmented control */}
        <div className="hidden sm:inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-800/50 border border-zinc-700/70">
          {LANGS.map(lng => (
            <button
              key={lng}
              onClick={() => changeLang(lng)}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                i18n.language === lng
                  ? 'bg-emerald-500 text-emerald-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
        {/* Mobile: compact single-language toggle target */}
        <div className="sm:hidden inline-flex items-center gap-0.5">
          {LANGS.map(lng => (
            <button
              key={lng}
              onClick={() => changeLang(lng)}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                i18n.language === lng ? 'bg-emerald-600 text-white font-medium' : 'text-gray-500'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Server status — chip with a pulse dot */}
        <div
          className="inline-flex items-center gap-2 h-8 px-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/70"
          title={t('header.connectionTitle')}
        >
          <span className="relative grid place-items-center">
            <span
              className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`}
              style={connected ? { boxShadow: '0 0 0 3px rgba(52,211,153,.22)' } : { boxShadow: '0 0 0 3px rgba(239,68,68,.22)' }}
            />
          </span>
          {connected ? (
            <Server className="w-4 h-4 text-emerald-400/90" />
          ) : (
            <ServerOff className="w-4 h-4 text-red-500" />
          )}
          <span className="hidden sm:inline text-xs font-medium text-zinc-300">
            {connected ? t('header.server') : t('header.serverOffline')}
          </span>
        </div>

        {/* Rain badge */}
        <RainBadge rainState={rainState} />

        {/* Diagnostics drawer — Activity icon (not a gear, which reads as
            "settings"); kept subtle so it doesn't compete with the tabs. */}
        <button
          onClick={onOpenDrawer}
          title={t('header.diagnostics', 'Diagnostics & logs')}
          className="grid place-items-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Open diagnostics drawer"
        >
          <Activity className="w-4 h-4" />
        </button>
      </div>

      <BleScanner open={showBle} onClose={() => setShowBle(false)} />
    </header>
  );
}
