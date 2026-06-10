import React from 'react';
import { createRoot } from 'react-dom/client';

// Offline-bundled fonts (no CDN — this is a local-first tool). Baloo 2 = rounded,
// friendly display for headings/buttons; Nunito = warm, readable body/UI text.
import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/500.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';

import './index.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
