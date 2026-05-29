import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiClient } from '../services/api';
import { getServerUrl } from '../services/auth';
import { fixQualityLabel } from '../utils/fixQuality';
import ManualJoystick from './ManualJoystick';

type Step = 'intro' | 'docking';

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
  const rsStr = String(sensors?.recharge_status ?? '');
  const bs = String(sensors?.battery_state ?? '').toLowerCase();
  // On-dock / charging — required to start the re-anchor (the back-1m + redock
  // must begin from the dock). "Charging"/"Charging (9)" but not
  // "Not charging"/"Discharged".
  const docked = rsStr.includes('Charging') || rsStr.includes('9') || bs === 'charging' || bs === 'full';
  const headingRaw = sensors?.heading_deg;
  const gnssTrackRaw = sensors?.gnss_track_deg;
  const gnssSpeedRaw = sensors?.gnss_speed;
  const moving = gnssSpeedRaw != null && parseFloat(String(gnssSpeedRaw)) > 0.1;
  const canReanchor = docked;

  async function reanchorNow() {
    if (!canReanchor) return;
    setErr(null);
    setStep('docking');
    const url = await getServerUrl();
    if (!url) { setErr('No server configured'); setStep('intro'); return; }
    const api = new ApiClient(url);
    try {
      const r = await api.reanchor(sn);
      if (!r.ok) { setErr(r.error ?? 'Re-anchor failed'); setStep('intro'); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Re-anchor failed');
      setStep('intro');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 20, gap: 14 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Re-anchor after restore</Text>

          {step === 'intro' && (
            <>
              <Text style={{ color: '#cbd5e1' }}>
                De kaart is hersteld. Doe dit:{'\n'}
                1. Zet de maaier op de dock tot hij laadt (joystick hieronder is
                alleen om hem naar de dock te rijden).{'\n'}
                2. Druk één keer op Re-anchor. Daarna doet de maaier alles zelf:
                ~1m achteruit en automatisch terug docken; de ArUco-snap lijnt het
                frame opnieuw uit. Jij hoeft verder niets te doen.{'\n'}
                De polygon blijft ongewijzigd; dit venster sluit vanzelf als het klaar is.
              </Text>

              {/* Live status */}
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

              {err && <Text style={{ color: '#ef4444', fontWeight: '700' }}>{err}</Text>}

              {/* Gate: re-anchor must start with the mower on the dock */}
              {docked ? (
                <Text style={{ color: '#22c55e', fontWeight: '700' }}>
                  Maaier staat op de dock - klaar om te re-ankeren.
                </Text>
              ) : (
                <Text style={{ color: '#f59e0b', fontWeight: '700' }}>
                  Zet de maaier eerst OP de dock (laden) met de joystick.
                </Text>
              )}

              {/* Touch joystick — same as JoystickScreen, socket-based. */}
              <ManualJoystick sn={sn} />

              <Btn label="Re-anchor (auto)" onPress={reanchorNow} disabled={!canReanchor} />
              <Btn label="Later" onPress={onClose} secondary />
            </>
          )}

          {step === 'docking' && (
            <>
              <ActivityIndicator color="#22c55e" />
              <Text style={{ color: '#cbd5e1' }}>
                Re-ankeren bezig: ~1m achteruit en terug docken via de ArUco-snap.
                Dit venster sluit automatisch zodra het frame opnieuw geankerd is.
                Lukt het docken niet, ga terug en probeer opnieuw.
              </Text>
              <Btn label="Terug" onPress={() => setStep('intro')} secondary />
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
