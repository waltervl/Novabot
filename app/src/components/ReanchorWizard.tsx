import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiClient, ReanchorStatus } from '../services/api';
import { getServerUrl } from '../services/auth';
import { fixQualityLabel } from '../utils/fixQuality';
import ManualJoystick from './ManualJoystick';
import { useI18n } from '../i18n';

interface Props {
  visible: boolean;
  sn: string;
  /** Live raw device sensors map (devices.get(sn)?.sensors). */
  sensors: Record<string, string> | undefined;
  onClose: () => void;
}

// Automatic re-anchor (Novabot-cq3). After a bundle restore the saved map frame
// no longer agrees with the live UTM frame, so the server sets frame_unvalidated
// and the app shows this wizard. With the mower ON the dock and on a real RTK
// Fixed, one button runs the whole server-orchestrated sequence:
//   reanchor_pos (origin = docked GPS) -> drive ~1m back to re-lock -> visual
//   ArUco dock -> self-verify the docked position is on the origin -> clear the
//   flag. We poll GET /reanchor/:sn/status for progress (the server messages are
//   already user-facing Dutch). On success the server clears frame_unvalidated,
//   which makes `visible` false and closes this modal.
// Manual backup: if re-lock or docking times out, the joystick stays available so
// the operator can drive the mower back onto the dock, then "Verifieer" re-runs
// the docked-on-origin check alone and clears the flag if it lands right.

const PHASES_RUNNING: ReanchorStatus['phase'][] = ['check', 'anchor', 'relock', 'wait', 'dock', 'verify'];

export default function ReanchorWizard({ visible, sn, sensors, onClose }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<ReanchorStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rtk = fixQualityLabel(sensors?.rtk_fix_quality);
  const isFixed = rtk.label === 'RTK Fixed';
  const rsStr = String(sensors?.recharge_status ?? '');
  const bs = String(sensors?.battery_state ?? '').toLowerCase();
  // On-dock / charging — required to START (the origin is captured on the dock).
  const docked = rsStr.includes('Charging') || rsStr.includes('9') || bs === 'charging' || bs === 'full';
  const canStart = docked && isFixed;

  // The auto flow reached a terminal error the operator can recover from manually.
  const inError = status?.phase === 'error';

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Reset wizard state whenever it (re)opens.
  useEffect(() => {
    if (!visible) { stopPolling(); return; }
    setRunning(false);
    setStatus(null);
    setErr(null);
  }, [visible, stopPolling]);

  // Poll the server-side progress while the auto flow runs.
  useEffect(() => {
    if (!running) { stopPolling(); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const url = await getServerUrl();
        if (!url || cancelled) return;
        const s = await new ApiClient(url).getReanchorStatus(sn);
        if (cancelled) return;
        setStatus(s);
        if (s.phase === 'done' && s.ok) {
          stopPolling();
          setRunning(false);
          setTimeout(() => { if (!cancelled) onClose(); }, 1200);
        } else if (s.phase === 'error') {
          stopPolling();
          setRunning(false);
        }
      } catch {
        // transient network error — keep polling
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 2000);
    return () => { cancelled = true; stopPolling(); };
  }, [running, sn, onClose, stopPolling]);

  async function startAuto() {
    setErr(null);
    setStatus(null);
    const url = await getServerUrl();
    if (!url) { setErr(t('reanchorNoServer')); return; }
    try {
      const r = await new ApiClient(url).reanchor(sn, 'auto');
      if (!r.ok) { setErr(r.error ?? t('reanchorStartFailed')); return; }
      setRunning(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('reanchorStartFailed'));
    }
  }

  async function verifyManual() {
    setErr(null);
    const url = await getServerUrl();
    if (!url) { setErr(t('reanchorNoServer')); return; }
    try {
      const r = await new ApiClient(url).reanchor(sn, 'verify');
      if (!r.ok) { setErr(r.error ?? t('reanchorVerifyFailedErr')); return; }
      setRunning(true); // poll the verify result the same way
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('reanchorVerifyFailedErr'));
    }
  }

  const StatusBlock = (
    <View style={{ gap: 4 }}>
      <Text style={{ color: rtk.color, fontWeight: '700' }}>RTK: {rtk.label}</Text>
      <Text style={{ color: docked ? '#22c55e' : '#f59e0b', fontSize: 13, fontWeight: '700' }}>
        {docked ? t('reanchorOnDock') : t('reanchorOffDock')}
      </Text>
    </View>
  );

  // Live progress/result text: prefer the server's stable msgKey (translated
  // here with pose/dist) and fall back to its Dutch `message` for older servers.
  const liveMessage = (s: ReanchorStatus | null): string => {
    if (!s) return t('reanchorBusy');
    if (s.msgKey) {
      return t(s.msgKey, {
        x: s.pose ? s.pose.x.toFixed(2) : '',
        y: s.pose ? s.pose.y.toFixed(2) : '',
        dist: Number.isFinite(s.dist as number) ? (s.dist as number).toFixed(2) : '?',
      });
    }
    return s.message || t('reanchorBusy');
  };

  const phaseRunning = status != null && PHASES_RUNNING.includes(status.phase);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 20, gap: 14 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{t('reanchorTitle')}</Text>

          {/* Running: server-orchestrated sequence in progress. */}
          {running || phaseRunning ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color="#22c55e" />
                <Text style={{ color: '#cbd5e1', flex: 1 }}>{liveMessage(status)}</Text>
              </View>
              <Text style={{ color: '#64748b', fontSize: 12 }}>{t('reanchorRunningHint')}</Text>
            </>
          ) : status?.phase === 'done' && status.ok ? (
            <Text style={{ color: '#22c55e', fontWeight: '700' }}>{liveMessage(status)}</Text>
          ) : inError ? (
            /* Terminal error: offer the manual backup. */
            <>
              <Text style={{ color: '#ef4444', fontWeight: '700' }}>{liveMessage(status)}</Text>
              <Text style={{ color: '#cbd5e1', fontSize: 13 }}>{t('reanchorManualBackupHint')}</Text>
              {StatusBlock}
              <ManualJoystick sn={sn} />
              <Btn label={t('reanchorBtnVerify')} onPress={verifyManual} disabled={!docked} />
              <Btn label={t('reanchorBtnRetryAuto')} onPress={startAuto} disabled={!canStart} secondary />
              <Btn label={t('reanchorBtnLater')} onPress={onClose} secondary />
            </>
          ) : (
            /* Idle: preconditions + the one-button start. */
            <>
              <Text style={{ color: '#cbd5e1' }}>{t('reanchorIdleIntro')}</Text>
              {StatusBlock}
              {err && <Text style={{ color: '#ef4444', fontWeight: '700' }}>{err}</Text>}
              {canStart ? (
                <Text style={{ color: '#22c55e', fontWeight: '700' }}>{t('reanchorReady')}</Text>
              ) : (
                <Text style={{ color: '#f59e0b', fontWeight: '700' }}>
                  {!docked ? t('reanchorNeedDock') : t('reanchorNeedFix', { label: rtk.label })}
                </Text>
              )}
              <ManualJoystick sn={sn} />
              <Btn label={t('reanchorBtnStart')} onPress={startAuto} disabled={!canStart} />
              <Btn label={t('reanchorBtnLater')} onPress={onClose} secondary />
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
