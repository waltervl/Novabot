export interface InstallerConfig {
  hostname: string;
  network:
    | { type: 'ethernet' }
    | { type: 'wifi'; ssid: string; password: string; country: string };
  timezone: string;
  connectionPath: 'opennova-app' | 'novabot-app';
}

export interface GeneratedFiles {
  firstrunSh: string;
  envFile: string;
  composeYml: string;
  cmdlineAppend: string;
}
