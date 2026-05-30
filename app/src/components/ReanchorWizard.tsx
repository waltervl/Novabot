import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiClient } from '../services/api';
import { getServerUrl } from '../services/auth';
import { fixQualityLabel } from '../utils/fixQuality';
import ManualJoystick from './ManualJoystick';

type Step = 'intro' | 'await' | 'docking';

interface Props {
  visible: boolean;
  sn: string;
  /** Live raw device sensors map (devices.get(sn)?.sensors). */
  sensors: Record<string, string> | undefined;
  onClose: () => void;
}

// Documented re-anchor (MAP-BACKUP-RESTORE-FLOW.md): with the mower ON the dock,
// the server drives it ~1m back then go_to_charge, and the ArUco redock snap
// realigns the local frame to charging_station.yaml. That snap (not pos.json)
// is what re-anchors. Success = the server clearing frame_unvalidated, which
// makes `visible` false and closes this modal. The joystick lets the user drive
// the mower onto the dock first if it is not already there.

export default function ReanchorWizard({ visible, sn, sensors, onClose }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [err, setErr] = useState<string | null>(null);

  const rtk = fixQualityLabel(sensors?.rtk_fix_quality);
  const isFixed = rtk.label === 'RTK Fixed';
  const rsStr = String(sensors?.recharge_status ?? '');
  const bs = String(sensors?.battery_state ?? '').toLowerCase();
  // On-dock / charging — required to START (the drive-back begins from the dock).
  const docked = rsStr.includes('Charging') || rsStr.includes('9') || bs === 'charging' || bs === 'full';
  const headingRaw = sensors?.heading_deg;
  const gnssTrackRaw = sensors?.gnss_track_deg;
  const gnssSpeedRaw = sensors?.gnss_speed;
  const moving = gnssSpeedRaw != null && parseFloat(String(gnssSpeedRaw)) > 0.1;

  // Watchdog: if docking doesn't finish (server clears the flag) within ~2 min,
  // return to the await step with a message so the spinner never hangs forever.
  useEffect(() => {
    if (step !== 'docking') return;
    const t = setTimeout(() => {
      setErr('Docken duurde te lang of is niet gelukt. Controleer de positie en probeer opnieuw.');
      setStep('await');
    }, 120000);
    return () => clearTimeout(t);
  }, [step]);

  async function callReanchor(action: 'drive' | 'spin' | 'dock', nextStep?: Step) {
    setErr(null);
    const url = await getServerUrl();
    if (!url) { setErr('No server configured'); return; }
    const api = new ApiClient(url);
    try {
      const r = await api.reanchor(sn, action);
      if (!r.ok) { setErr(r.error ?? 'Re-anchor failed'); return; }
      if (nextStep) setStep(nextStep);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Re-anchor failed');
    }
  }

  const StatusBlock = (
    <View style={{ gap: 4 }}>
      <Text style={{ color: rtk.color, fontWeight: '700' }}>RTK: {rtk.label}</Text>
      <Text style={{ color: '#cbd5e1', fontSize: 13 }}>
        Heading: {headingRaw != null ? `${headingRaw}°` : '—'}
      </Text>
      <Text style={{ color: '#cbd5e1', fontSize: 13 }}>
        GNSS-koers: {gnssTrackRaw != null && moving ? `${gnssTrackRaw}°` : '— (rij om te tonen)'}
        {gnssSpeedRaw != null ? `  · ${gnssSpeedRaw} m/s` : ''}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 20, gap: 14 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Re-anchor after restore</Text>

          {step === 'intro' && (
            <>
              <Text style={{ color: '#cbd5e1' }}>
                De kaart is hersteld. Zet de maaier op de dock tot hij laadt
                (joystick is om hem naar de dock te rijden). Druk dan op Start:
                de maaier rijdt ~1m van de dock af. Daarna wacht je op een RTK
                Fixed en dok je hem. De polygon blijft ongewijzigd.
              </Text>
              {StatusBlock}
              {err && <Text style={{ color: '#ef4444', fontWeight: '700' }}>{err}</Text>}
              {docked ? (
                <Text style={{ color: '#22c55e', fontWeight: '700' }}>Maaier staat op de dock - klaar om te starten.</Text>
              ) : (
                <Text style={{ color: '#f59e0b', fontWeight: '700' }}>Zet de maaier eerst OP de dock (laden).</Text>
              )}
              <ManualJoystick sn={sn} />
              <Btn label="Start (rij van de dock)" onPress={() => callReanchor('drive', 'await')} disabled={!docked} />
              <Btn label="Later" onPress={onClose} secondary />
            </>
          )}

          {step === 'await' && (
            <>
              <Text style={{ color: '#cbd5e1' }}>
                De maaier is van de dock. Wacht tot RTK Fixed (groen). Lukt dat niet,
                rij met de joystick nog wat terug of draai 360°. Bij RTK Fixed: Dock.
              </Text>
              {StatusBlock}
              {err && <Text style={{ color: '#ef4444', fontWeight: '700' }}>{err}</Text>}
              {isFixed ? (
                <Text style={{ color: '#22c55e', fontWeight: '700' }}>RTK Fixed - klaar om te docken.</Text>
              ) : (
                <Text style={{ color: '#f59e0b', fontWeight: '700' }}>Nog geen RTK Fixed (nu: {rtk.label}).</Text>
              )}
              <ManualJoystick sn={sn} />
              <Btn label="Dock nu (ArUco)" onPress={() => callReanchor('dock', 'docking')} disabled={!isFixed} />
              <Btn label="Draai 360°" onPress={() => callReanchor('spin')} secondary />
              <Btn label="Later" onPress={onClose} secondary />
            </>
          )}

          {step === 'docking' && (
            <>
              <ActivityIndicator color="#22c55e" />
              <Text style={{ color: '#cbd5e1' }}>
                Docken via de ArUco-snap... dit venster sluit automatisch zodra het
                frame opnieuw geankerd is. Lukt het docken niet, ga terug en probeer opnieuw.
              </Text>
              <Btn label="Terug" onPress={() => setStep('await')} secondary />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Btn({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        backgroundColor: secondary ? 'transparent' : (disabled ? '#374151' : '#2563eb'),
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: secondary ? '#94a3b8' : '#fff', fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}
