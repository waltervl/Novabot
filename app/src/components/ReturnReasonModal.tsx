/**
 * ReturnReasonModal — explains WHY the mower returned to / sits on the dock,
 * with an optional interrupt/override action (e.g. ignore rain & resume).
 *
 * A rain pause now sets Work:USER_STOP (same as a manual pause), so the
 * server-provided `rain_paused` sensor flag is the only reliable way to tell
 * rain apart from a manual pause — see deriveReturnReason() priority order.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme, type Colors } from '../theme';
import { useI18n } from '../i18n';

export type ReturnReason =
  | 'rain'
  | 'low_battery'
  | 'time_limit'
  | 'manual'
  | 'finished'
  | 'error'
  | null;

/**
 * Derive the return reason from the live sensor map + error flag.
 * Priority order is significant: an active error always wins, the rain flag
 * beats the (now identical) USER_STOP msg, and finished beats manual.
 */
export function deriveReturnReason(
  sensors: Record<string, string> | undefined,
  hasError: boolean,
): ReturnReason {
  if (hasError) return 'error';
  if (sensors?.rain_paused === '1') return 'rain';
  const msg = sensors?.msg ?? '';
  if (/Work:(USER_RECHARGE_STOP|BATTERY_LOW_RECHARGE)\b/.test(msg)) return 'low_battery';
  if (/Work:TIME_LIMIT_STOP\b/.test(msg)) return 'time_limit';
  if (/Work:(FINISHED|FINISHED_ONCE)\b/.test(msg)) return 'finished';
  if (/Work:(USER_STOP|PAUSED)\b/.test(msg)) return 'manual';
  return null;
}

interface ReasonMeta {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Per-reason whether the modal offers a Resume/interrupt action. */
  offersResume: boolean;
}

/** Per-reason icon/color/resume metadata, also reused by the dismissed-state chip. */
export const RETURN_REASON_META: Record<Exclude<ReturnReason, null>, ReasonMeta> = {
  rain: { icon: 'rainy', color: '#60a5fa', offersResume: true },
  low_battery: { icon: 'battery-dead', color: '#f59e0b', offersResume: false },
  time_limit: { icon: 'time', color: '#f59e0b', offersResume: true },
  manual: { icon: 'home', color: '#94a3b8', offersResume: true },
  finished: { icon: 'checkmark-circle', color: '#22c55e', offersResume: false },
  error: { icon: 'warning', color: '#ef4444', offersResume: false },
};

const TITLE_FALLBACK: Record<Exclude<ReturnReason, null>, { key: string; fb: string }> = {
  rain: { key: 'rrRainTitle', fb: 'Teruggekeerd: regen' },
  low_battery: { key: 'rrBatteryTitle', fb: 'Opladen — lage batterij' },
  time_limit: { key: 'rrTimeTitle', fb: 'Tijdslimiet bereikt' },
  manual: { key: 'rrManualTitle', fb: 'Handmatig teruggestuurd' },
  finished: { key: 'rrFinishedTitle', fb: 'Maaien voltooid' },
  error: { key: 'rrErrorTitle', fb: 'Teruggekeerd door storing' },
};

const DESC_FALLBACK: Record<Exclude<ReturnReason, null>, { key: string; fb: string }> = {
  rain: {
    key: 'rrRainDesc',
    fb: 'De maaier is naar het laadstation gereden omdat er regen werd gedetecteerd. Hervat om de regenpauze te negeren.',
  },
  low_battery: {
    key: 'rrBatteryDesc',
    fb: 'De maaier laadt op en hervat automatisch zodra de accu vol is.',
  },
  time_limit: {
    key: 'rrTimeDesc',
    fb: 'De ingestelde maaitijd is bereikt. Je kunt het maaien hervatten.',
  },
  manual: {
    key: 'rrManualDesc',
    fb: 'De maaier is handmatig naar het laadstation gestuurd. Je kunt het maaien hervatten.',
  },
  finished: {
    key: 'rrFinishedDesc',
    fb: 'Het maaien is voltooid en de maaier staat weer op het laadstation.',
  },
  error: {
    key: 'rrErrorDesc',
    fb: 'De maaier is teruggekeerd door een storing. Los de storing op en probeer opnieuw.',
  },
};

const RESUME_LABEL: Record<Exclude<ReturnReason, null>, { key: string; fb: string }> = {
  rain: { key: 'rrRainResume', fb: 'Negeer regen & hervat' },
  low_battery: { key: 'rrResume', fb: 'Hervat' },
  time_limit: { key: 'rrResume', fb: 'Hervat' },
  manual: { key: 'rrResume', fb: 'Hervat' },
  finished: { key: 'rrResume', fb: 'Hervat' },
  error: { key: 'rrResume', fb: 'Hervat' },
};

interface Props {
  visible: boolean;
  reason: ReturnReason;
  online: boolean;
  loading: boolean;
  onResume: () => void;
  onDismiss: () => void;
}

export function ReturnReasonModal({ visible, reason, online, loading, onResume, onDismiss }: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useI18n();

  if (!reason) return null;
  const meta = RETURN_REASON_META[reason];
  const title = t(TITLE_FALLBACK[reason].key) || TITLE_FALLBACK[reason].fb;
  const desc = t(DESC_FALLBACK[reason].key) || DESC_FALLBACK[reason].fb;
  const showResume = meta.offersResume && online;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Ionicons name={meta.icon} size={28} color={meta.color} />
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.body}>{desc}</Text>

          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.btn, styles.btnDismiss]} onPress={onDismiss}>
              <Text style={styles.btnDismissText}>{t('rrDismiss') || t('close') || 'Sluiten'}</Text>
            </TouchableOpacity>
            {showResume && (
              <TouchableOpacity
                style={[styles.btn, styles.btnResume, { backgroundColor: meta.color }]}
                onPress={onResume}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnResumeText}>
                    {t(RESUME_LABEL[reason].key) || RESUME_LABEL[reason].fb}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 380,
    backgroundColor: c.bg, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  iconRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: c.text },
  body: { fontSize: 14, color: c.text, lineHeight: 20, marginBottom: 16 },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDismiss: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnDismissText: { color: c.text, fontSize: 14, fontWeight: '600' },
  btnResume: {},
  btnResumeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
