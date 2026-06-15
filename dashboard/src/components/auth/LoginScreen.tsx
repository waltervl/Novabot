import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Mail, LoaderCircle } from 'lucide-react';
import { login } from '../../api/client';

interface Props {
  onSuccess: () => void;
}

/**
 * Shown only when the server rejects this client as unauthenticated — i.e. the
 * dashboard is being opened from the public internet. LAN/VPN users never reach
 * this screen. Credentials are the same OpenNova app account.
 */
export function LoginScreen({ onSuccess }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('login.error'));
      setBusy(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/OpenNova.png" alt="OpenNova" className="h-12 w-auto" />
          <h1
            className="text-lg text-gray-300 tracking-widest uppercase"
            style={{ fontFamily: "'Posterama 1919', sans-serif", letterSpacing: '0.2em' }}
          >
            {t('login.title')}
          </h1>
        </div>

        <form
          onSubmit={submit}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4"
        >
          <p className="text-xs text-zinc-400 leading-relaxed">{t('login.subtitle')}</p>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">{t('login.email')}</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">{t('login.password')}</span>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="mt-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-emerald-500 text-emerald-950 font-semibold text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            {busy ? t('login.signingIn') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
