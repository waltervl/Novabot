import { useState, useEffect } from 'react';
import { DashboardShell } from './shell/DashboardShell';
import { OnboardingWizard } from './components/setup/OnboardingWizard';
import { ToastProvider } from './components/common/Toast';
import { useDevices } from './hooks/useDevices';
import { checkSetupStatus, checkCertTrusted } from './api/client';
import { MobilePage } from './mobile/MobilePage';

type AppState = 'loading' | 'onboarding' | 'onboarding-cert-only' | 'ready';

export default function App() {
  const { devices, loading, connected, liveOutlines, coveredLanes } = useDevices();
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    async function init() {
      try {
        const [{ hasUsers }, certOk] = await Promise.all([
          checkSetupStatus(),
          checkCertTrusted(),
        ]);

        if (!hasUsers) {
          setAppState('onboarding');          // Volledige wizard (welkom + account + cert)
        } else if (!certOk) {
          setAppState('onboarding-cert-only'); // Alleen de cert-stap
        } else {
          setAppState('ready');
        }
      } catch {
        // Server niet bereikbaar — toch tonen
        setAppState('ready');
      }
    }
    init();
  }, []);

  if (appState === 'loading') {
    return <div className="min-h-screen bg-gray-950" />;
  }

  if (appState === 'onboarding') {
    return (
      <ToastProvider>
        <OnboardingWizard onComplete={() => setAppState('ready')} />
      </ToastProvider>
    );
  }

  if (appState === 'onboarding-cert-only') {
    return (
      <ToastProvider>
        <OnboardingWizard skipAccount onComplete={() => setAppState('ready')} />
      </ToastProvider>
    );
  }

  const isMobile = window.location.pathname.startsWith('/mobile');

  return (
    <ToastProvider>
      {isMobile ? (
        <MobilePage devices={devices} loading={loading} connected={connected} liveOutlines={liveOutlines} coveredLanes={coveredLanes} />
      ) : (
        <div className="dark min-h-screen bg-gray-950 text-white overflow-x-hidden">
          <DashboardShell />
        </div>
      )}
    </ToastProvider>
  );
}
