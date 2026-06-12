import { useEffect, useState } from 'react';
import { installer } from '../ipc';
import type { InstallerConfig, SshConfig } from '../../shared/types';

interface ConfigStepProps {
  config?: InstallerConfig;
  onChange: (config: InstallerConfig) => void;
  /** Reports whether `<hostname>.local` clashes on the network, so the wizard
   *  can block advancing until the user picks a free name. */
  onHostnameTakenChange: (taken: boolean) => void;
}

type NetworkType = 'ethernet' | 'wifi';
type ConnectionPath = InstallerConfig['connectionPath'];

export function ConfigStep({ config, onChange, onHostnameTakenChange }: ConfigStepProps) {
  const [hostname, setHostname] = useState(config?.hostname ?? 'opennova');
  const [networkType, setNetworkType] = useState<NetworkType>(
    config?.network.type ?? 'ethernet',
  );
  const [ssid, setSsid] = useState(
    config?.network.type === 'wifi' ? config.network.ssid : '',
  );
  const [password, setPassword] = useState(
    config?.network.type === 'wifi' ? config.network.password : '',
  );
  const [country, setCountry] = useState(
    config?.network.type === 'wifi' ? config.network.country : 'NL',
  );
  const [timezone, setTimezone] = useState(config?.timezone ?? 'Europe/Amsterdam');
  const [connectionPath, setConnectionPath] = useState<ConnectionPath>(
    config?.connectionPath ?? 'opennova-app',
  );
  const [showPassword, setShowPassword] = useState(false);

  // SSH access. On by default with a working account so the Pi is reachable over
  // SSH out of the box (modern Pi OS has no default `pi` user).
  const [sshEnabled, setSshEnabled] = useState(config?.ssh?.enabled ?? true);
  const [sshUser, setSshUser] = useState(config?.ssh?.username ?? 'opennova');
  const [sshPass, setSshPass] = useState(config?.ssh?.password ?? '');
  const [sshKey, setSshKey] = useState(config?.ssh?.publicKey ?? '');
  const [showSshPass, setShowSshPass] = useState(false);

  // Assemble the config and lift it whenever any field changes.
  useEffect(() => {
    const network: InstallerConfig['network'] =
      networkType === 'wifi'
        ? { type: 'wifi', ssid, password, country }
        : { type: 'ethernet' };
    const ssh: SshConfig = {
      enabled: sshEnabled,
      username: sshUser.trim(),
      password: sshPass,
      publicKey: sshKey.trim() || undefined,
    };
    onChange({ hostname, network, timezone, connectionPath, ssh });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, networkType, ssid, password, country, timezone, connectionPath, sshEnabled, sshUser, sshPass, sshKey]);

  const hostnameInvalid = hostname.trim().length === 0;
  const ssidInvalid = networkType === 'wifi' && ssid.trim().length === 0;
  // Mirror the wizard's SSH advance-guard so the user gets inline feedback.
  const sshUserInvalid = sshEnabled && !/^[a-z_][a-z0-9_-]{0,31}$/.test(sshUser.trim());
  const sshPassTooShort = sshEnabled && sshPass.length > 0 && sshPass.length < 8;
  const sshNeedsSecret =
    sshEnabled && sshPass.length < 8 && sshKey.trim().length === 0;

  // Warn (don't block) if `<hostname>.local` is already taken on the network —
  // e.g. another OpenNova server — which would make this Pi unreachable by name.
  const [takenBy, setTakenBy] = useState<string | null>(null);
  useEffect(() => {
    const name = hostname.trim();
    if (name.length === 0) {
      setTakenBy(null);
      onHostnameTakenChange(false);
      return;
    }
    const t = setTimeout(() => {
      void installer.checkHostname(name).then((res) => {
        if (res.ok && res.value.taken) {
          setTakenBy(res.value.address ?? 'another device');
          onHostnameTakenChange(true);
        } else {
          setTakenBy(null);
          onHostnameTakenChange(false);
        }
      });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display text-3xl text-ink">A few quick settings</h2>
        <p className="mt-2 text-[0.95rem] text-ink-dim font-medium leading-relaxed">
          These are saved onto the card and applied the first time your Pi starts up.
        </p>
      </div>

      <Field label="Give it a name" htmlFor="hostname">
        <input
          id="hostname"
          type="text"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          className="field"
          spellCheck={false}
        />
        {hostnameInvalid && <Note tone="danger">Please enter a name.</Note>}
        {!hostnameInvalid && takenBy && (
          <Note tone="warn">
            <span className="text-coral font-bold">{hostname.trim()}.local</span> is already taken on
            your network ({takenBy}). Choose a different name to continue.
          </Note>
        )}
      </Field>

      <fieldset>
        <legend className="eyebrow mb-2.5">How does it connect?</legend>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Selector
            name="network"
            checked={networkType === 'ethernet'}
            onChange={() => setNetworkType('ethernet')}
            label="Ethernet"
            subtitle="Best option, a cable to your router."
          />
          <Selector
            name="network"
            checked={networkType === 'wifi'}
            onChange={() => setNetworkType('wifi')}
            label="Wi-Fi"
            subtitle="Join your wireless network."
          />
        </div>

        {networkType === 'wifi' && (
          <div className="mt-3.5 space-y-4 border-l-2 border-green/50 pl-4">
            <Field label="Network name" htmlFor="ssid">
              <input
                id="ssid"
                type="text"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="field"
                spellCheck={false}
              />
              {ssidInvalid && <Note tone="danger">Please enter your network name.</Note>}
            </Field>
            <Field label="Password" htmlFor="wifi-password">
              <div className="relative">
                <input
                  id="wifi-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-faint hover:text-green transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>
            <Field label="Country" htmlFor="country">
              <input
                id="country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                className="field w-20 text-center tracking-[0.3em]"
              />
            </Field>
          </div>
        )}
      </fieldset>

      <Field label="Timezone" htmlFor="timezone">
        <input
          id="timezone"
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="field"
          spellCheck={false}
        />
      </Field>

      <fieldset>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <legend className="eyebrow">Remote access (SSH)</legend>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm font-semibold text-ink-dim">
              {sshEnabled ? 'On' : 'Off'}
            </span>
            <input
              type="checkbox"
              checked={sshEnabled}
              onChange={(e) => setSshEnabled(e.target.checked)}
              className="h-4 w-4 accent-green"
            />
          </label>
        </div>
        {sshEnabled && (
          <div className="space-y-4 border-l-2 border-green/50 pl-4">
            <Field label="Username" htmlFor="ssh-user">
              <input
                id="ssh-user"
                type="text"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value.toLowerCase())}
                className="field"
                spellCheck={false}
                autoComplete="off"
              />
              {sshUserInvalid && (
                <Note tone="danger">
                  Lowercase letters, digits, - or _, starting with a letter (max 32).
                </Note>
              )}
            </Field>
            <Field label="Password" htmlFor="ssh-pass">
              <div className="relative">
                <input
                  id="ssh-pass"
                  type={showSshPass ? 'text' : 'password'}
                  value={sshPass}
                  onChange={(e) => setSshPass(e.target.value)}
                  className="field pr-12"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowSshPass((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-faint hover:text-green transition-colors"
                  aria-label={showSshPass ? 'Hide password' : 'Show password'}
                  title={showSshPass ? 'Hide password' : 'Show password'}
                >
                  {showSshPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {sshPassTooShort && (
                <Note tone="danger">Password must be at least 8 characters.</Note>
              )}
            </Field>
            <Field label="Public key (optional)" htmlFor="ssh-key">
              <textarea
                id="ssh-key"
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                className="field font-mono text-xs leading-relaxed"
                rows={3}
                spellCheck={false}
                placeholder="ssh-ed25519 AAAA… your@machine"
              />
            </Field>
            {sshNeedsSecret && (
              <Note tone="warn">
                Set a password of 8+ characters or paste a public key so you can log in.
              </Note>
            )}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-2.5">Which app will you use?</legend>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Selector
            name="connection"
            checked={connectionPath === 'opennova-app'}
            onChange={() => setConnectionPath('opennova-app')}
            label="OpenNova app"
            subtitle="Finds your Pi automatically."
          />
          <Selector
            name="connection"
            checked={connectionPath === 'novabot-app'}
            onChange={() => setConnectionPath('novabot-app')}
            label="Original Novabot app"
            subtitle="Redirects it to your Pi."
          />
        </div>
        {connectionPath === 'novabot-app' && (
          <Note tone="dim">
            Points the original app at your own Pi instead of the manufacturer cloud.
          </Note>
        )}
      </fieldset>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="eyebrow block mb-2">{label}</span>
      {children}
    </label>
  );
}

function Note({ tone, children }: { tone: 'danger' | 'warn' | 'dim'; children: React.ReactNode }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-coral' : 'text-ink-dim';
  return <p className={`mt-2 text-sm font-semibold leading-relaxed ${color}`}>{children}</p>;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

/** Friendly selector tile: a rounded row with a circular dot that fills green when picked.
 *  The native radio is kept for accessibility but visually hidden. */
function Selector({
  name,
  checked,
  onChange,
  label,
  subtitle,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  subtitle: string;
}) {
  return (
    <label className={['tile tile-selectable flex items-start gap-3 p-3', checked ? 'tile-on' : ''].join(' ')}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={[
          'mt-0.5 grid place-items-center w-[18px] h-[18px] rounded-full border-2 transition-colors',
          checked ? 'border-green' : 'border-line-strong',
        ].join(' ')}
        aria-hidden="true"
      >
        <span
          className={['w-2 h-2 rounded-full transition-all', checked ? 'bg-green' : 'bg-transparent'].join(' ')}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.95rem] font-bold text-ink leading-snug">{label}</span>
        <span className="block text-sm text-ink-dim font-medium mt-0.5">{subtitle}</span>
      </span>
    </label>
  );
}
