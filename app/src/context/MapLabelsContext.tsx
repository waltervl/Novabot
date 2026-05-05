/**
 * MapLabelsContext — toggle for showing zone + obstacle name labels on the
 * MowingProgressMap. Default ON; persists across restarts via SecureStore.
 *
 * Mirrors the dashboard MAP VIEWER which always renders labels — operators
 * who find them noisy on small phone screens can flip the switch off in
 * App Settings.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'opennova_map_labels';

interface MapLabelsState {
  enabled: boolean;
  toggle: () => void;
}

const MapLabelsContext = createContext<MapLabelsState>({
  enabled: true,
  toggle: () => {},
});

export function MapLabelsProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true); // default ON
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORE_KEY);
        // Only honour explicit 'false' — any other value (including null
        // for first-run users) keeps the default-on behaviour.
        if (stored === 'false') setEnabled(false);
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    SecureStore.setItemAsync(STORE_KEY, next ? 'true' : 'false').catch(() => {});
  }, [enabled]);

  if (!loaded) return null;

  return (
    <MapLabelsContext.Provider value={{ enabled, toggle }}>
      {children}
    </MapLabelsContext.Provider>
  );
}

export function useMapLabels(): MapLabelsState {
  return useContext(MapLabelsContext);
}
