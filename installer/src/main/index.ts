import { app, BrowserWindow } from 'electron';

const PLACEHOLDER_HTML =
  'data:text/html,' +
  encodeURIComponent(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>OpenNova Installer</title></head>' +
      '<body style="font-family: sans-serif; display: flex; ' +
      'align-items: center; justify-content: center; height: 100vh; ' +
      'margin: 0;"><h1>OpenNova Installer</h1></body></html>',
  );

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      contextIsolation: true,
    },
  });

  void win.loadURL(PLACEHOLDER_HTML);
}

void app.whenReady().then(() => {
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
