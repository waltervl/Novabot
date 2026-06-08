import { useEffect, useState } from 'react';
import type { InstallerConfig } from '../../shared/types';

interface ConfigStepProps {
  config?: InstallerConfig;
  onChange: (config: InstallerConfig) => void;
}

type NetworkType = 'ethernet' | 'wifi';
type ConnectionPath = InstallerConfig['connectionPath'];

export function ConfigStep({ config, onChange }: ConfigStepProps) {
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

  // Assemble the config and lift it whenever any field changes.
  useEffect(() => {
    const network: InstallerConfig['network'] =
      networkType === 'wifi'
        ? { type: 'wifi', ssid, password, country }
        : { type: 'ethernet' };
    onChange({ hostname, network, timezone, connectionPath });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, networkType, ssid, password, country, timezone, connectionPath]);

  const hostnameInvalid = hostname.trim().length === 0;
  const ssidInvalid = networkType === 'wifi' && ssid.trim().length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-slate-600">
          These settings are written to the card and applied on first boot.
        </p>
      </div>

      <Field label="Device name (hostname)" htmlFor="hostname">
        <input
          id="hostname"
          type="text"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {hostnameInvalid && (
          <p className="mt-1 text-sm text-red-600">Device name cannot be empty.</p>
        )}
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Network</legend>
        <Radio
          name="network"
          checked={networkType === 'ethernet'}
          onChange={() => setNetworkType('ethernet')}
          label="Ethernet"
          subtitle="Recommended. Plug the Pi into your router."
        />
        <Radio
          name="network"
          checked={networkType === 'wifi'}
          onChange={() => setNetworkType('wifi')}
          label="Wi-Fi"
          subtitle="Connect the Pi over your wireless network."
        />

        {networkType === 'wifi' && (
          <div className="ml-7 mt-2 space-y-3 border-l border-slate-200 pl-4">
            <Field label="Network name (SSID)" htmlFor="ssid">
              <input
                id="ssid"
                type="text"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              {ssidInvalid && (
                <p className="mt-1 text-sm text-red-600">
                  Network name cannot be empty.
                </p>
              )}
            </Field>
            <Field label="Password" htmlFor="wifi-password">
              <input
                id="wifi-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Country code" htmlFor="country">
              <input
                id="country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2"
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          How will you connect to the mower?
        </legend>
        <Radio
          name="connection"
          checked={connectionPath === 'opennova-app'}
          onChange={() => setConnectionPath('opennova-app')}
          label="OpenNova app"
          subtitle="Uses automatic discovery on your network."
        />
        <Radio
          name="connection"
          checked={connectionPath === 'novabot-app'}
          onChange={() => setConnectionPath('novabot-app')}
          label="Original Novabot app"
          subtitle="Enables a DNS redirect."
        />
        {connectionPath === 'novabot-app' && (
          <p className="ml-7 text-sm text-slate-500">
            This routes the original app to your Pi instead of the manufacturer
            cloud.
          </p>
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
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Radio({
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
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        <span className="block text-sm text-slate-500">{subtitle}</span>
      </span>
    </label>
  );
}
