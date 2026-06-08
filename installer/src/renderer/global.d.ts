// The preload bridge exposes the typed IPC surface on `window.installer`.
declare global {
  interface Window {
    installer: import('../shared/types').InstallerApi;
  }
}

export {};
