import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc.js';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  // In development the renderer is served by the Vite dev server (set
  // OPENNOVA_DEV_SERVER_URL, e.g. http://localhost:5173). In production we load
  // the built renderer. Main compiles to dist/main/, the renderer builds to
  // dist/renderer/, so the file sits one directory up from __dirname.
  const devServerUrl = process.env.OPENNOVA_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  registerIpcHandlers(ipcMain, {
    getWebContents: () => BrowserWindow.getAllWindows()[0]?.webContents,
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
