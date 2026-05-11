/**
 * Mower settings — cutting height, obstacle sensitivity, path direction.
 * Ported from dashboard SettingsPanel + Novabot app advanced settings.
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  FlatList,
} from 'react-native';
import { appAlertCompat } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles, useTheme, type Colors } from '../theme';
import { MowingDirectionPreview } from '../components/MowingDirectionPreview';
import { SimpleSlider } from '../components/SimpleSlider';
import { useMowerState } from '../hooks/useMowerState';
import { useActiveMower } from '../hooks/useActiveMower';
import { useHeadlightBrightness } from '../hooks/useHeadlightBrightness';
import * as Localization from 'expo-localization';
import { getSocket } from '../services/socket';
import { ApiClient } from '../services/api';
import { getServerUrl } from '../services/auth';

// Cutting height: 20-90 in steps of 10 (displayed as 2-9 cm, matches Flutter slider)
const HEIGHT_VALUES = [20, 30, 40, 50, 60, 70, 80, 90];

// Obstacle sensitivity: 1=low, 2=medium, 3=high (Flutter slider: min=1, max=3, divisions=2)
const SENSITIVITY_LEVELS = [
  { value: 1, label: 'Low', desc: 'Less avoidance, more coverage' },
  { value: 2, label: 'Medium', desc: 'Balanced (recommended)' },
  { value: 3, label: 'High', desc: 'Maximum obstacle avoidance' },
];

// Joystick speed/handling: 1=low, 2=medium, 3=high (sent as ×100: 100/200/300)
const CONTROLLER_LEVELS = [
  { value: 100, label: 'Low' },
  { value: 200, label: 'Medium' },
  { value: 300, label: 'High' },
];

// Common IANA timezones for the picker. The auto-detected device tz is
// prepended dynamically at render time so the operator can pick "their"
// zone with a single tap. Curated short-list because mqtt_node's
// set_cfg_info only validates that the string is a parseable IANA name —
// we don't need to ship the full 600+ tz database here.
const COMMON_TIMEZONES = [
  'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Paris',
  'Europe/London', 'Europe/Madrid', 'Europe/Rome', 'Europe/Vienna',
  'Europe/Warsaw', 'Europe/Stockholm', 'Europe/Helsinki', 'Europe/Athens',
  'Europe/Lisbon', 'Europe/Zurich', 'Europe/Prague', 'Europe/Dublin',
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Toronto', 'America/Vancouver',
  'America/Sao_Paulo', 'America/Mexico_City',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai',
];

function detectDeviceTimezone(): string {
  // expo-localization exposes the OS-reported IANA zone via Calendar metadata
  // — works on Hermes builds that lack a full ICU. Falls back to Intl
  // (modern web/desktop) and finally Europe/Amsterdam if both miss.
  try {
    const cals = Localization.getCalendars?.();
    if (cals && cals.length > 0 && cals[0].timeZone) return cals[0].timeZone;
  } catch { /* ignore */ }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch { /* ignore */ }
  return 'Europe/Amsterdam';
}

export default function MowerSettingsScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { devices } = useMowerState();
  const [cuttingHeight, setCuttingHeight] = useState(50);
  const [sensitivity, setSensitivity] = useState(2);
  const [pathDirection, setPathDirection] = useState(0);
  // Issue #41: when the user steps direction (e.g. 180 → 165 with the −15
  // button) we POST `path_direction` to the server, but the next inbound
  // MQTT sensor frame still carries the OLD value (the mower hasn't echoed
  // the new one yet). Without a guard, the sensor-sync useEffect below
  // overwrites the just-set local state and the slider snaps back — the
  // exact "stuck at 180" symptom Automate1 reported. Track when the user
  // last touched the slider so we can ignore stale sensor echoes for a
  // short window (longer than the round-trip).
  const lastPathDirEditAtRef = useRef<number>(0);
  const [joystickSpeed, setJoystickSpeed] = useState(300);
  const [joystickHandling, setJoystickHandling] = useState(300);
  const [headlight, setHeadlight] = useState(false);
  const [sound, setSound] = useState(false);
  // Mower IANA timezone — sent via set_cfg_info on Save. Default to the
  // operator's device tz so a fresh install lands in the right zone
  // without manual picker interaction. Existing users (e.g. issue #56
  // operator in Paris whose firmware still reports Amsterdam) can pick
  // their zone here without re-running BLE provisioning.
  const [timezone, setTimezone] = useState<string>(() => detectDeviceTimezone());
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const { brightness: headlightBrightness, setBrightness: setHeadlightBrightness } = useHeadlightBrightness();
  const [sending, setSending] = useState('');

  // Last-known mower-applied snapshot — used to drive the Save button's
  // "dirty" indicator. Updated whenever sensor data syncs back in or a
  // Save call completes. Compared against current slider state to know
  // if there are unsent changes.
  const [savedSnapshot, setSavedSnapshot] = useState(() => ({
    sensitivity: 2,
    pathDirection: 0,
    joystickSpeed: 300,
    joystickHandling: 300,
    headlight: false,
    headlightBrightness: 255,
    sound: false,
    cuttingHeight: 50,
    timezone: detectDeviceTimezone(),
  }));

  // Rain auto-pause — loaded from /api/dashboard/rain-settings/:sn, per-mower.
  const [rainEnabled, setRainEnabled] = useState(true);
  const [rainMm, setRainMm] = useState(0.1);
  const [rainProb, setRainProb] = useState(50);
  const [rainHours, setRainHours] = useState(0.5);

  const { activeMower: mower, activeMowerSn } = useActiveMower();
  const mowerSn = activeMowerSn ?? '';

  const mowerOnline = mower?.online ?? false;

  // Request current settings from mower via get_para_info
  useEffect(() => {
    if (!mowerSn || !mowerOnline) return;
    (async () => {
      try {
        const url = await getServerUrl();
        if (!url) return;
        const api = new ApiClient(url);
        await api.sendCommand(mowerSn, { get_para_info: {} });
      } catch { /* ignore */ }
    })();
  }, [mowerSn, mowerOnline]);

  // Load current values from sensor data (updated via socket + sensor cache)
  const sensorJson = mower ? JSON.stringify({
    h: mower.sensors.defaultCuttingHeight,
    o: mower.sensors.obstacle_avoidance_sensitivity,
    p: mower.sensors.path_direction,
    v: mower.sensors.manual_controller_v,
    w: mower.sensors.manual_controller_w,
    l: mower.sensors.headlight,
    s: mower.sensors.sound,
  }) : '';

  useEffect(() => {
    if (!mower) return;
    const s = mower.sensors;
    // Issue #23: previously only honoured defaultCuttingHeight (mm 20..90).
    // On a fresh install that field is empty, so the slider stayed at the
    // hardcoded 5cm default while the firmware was actually configured at
    // a different blade height. The Start sheet read target_height as a
    // fallback (correct), so the two screens disagreed. Mirror the Start
    // sheet's fallback chain: defaultCuttingHeight (mm) first, then
    // target_height (wire enum 0..7 where physical_mm = (wire + 2) * 10).
    if (s.defaultCuttingHeight) {
      const h = parseInt(s.defaultCuttingHeight, 10);
      if (h >= 20 && h <= 90) setCuttingHeight(h);
      else if (h >= 0 && h <= 7) setCuttingHeight((h + 2) * 10);   // wire stored as defaultCuttingHeight
      else if (h >= 2 && h <= 9) setCuttingHeight(h * 10);         // user cm stored as defaultCuttingHeight
    } else if (s.target_height) {
      const t = parseInt(s.target_height, 10);
      if (Number.isFinite(t) && t >= 0 && t <= 7) setCuttingHeight((t + 2) * 10);
    }
    if (s.obstacle_avoidance_sensitivity) {
      const v = parseInt(s.obstacle_avoidance_sensitivity, 10);
      if (v >= 1 && v <= 3) setSensitivity(v);
    }
    if (s.path_direction) {
      const a = parseInt(s.path_direction, 10);
      if (a >= 0 && a <= 180) {
        // Skip sensor-sync within 3 s of a local edit so a stale echo from
        // the broker can't snap the slider back to its previous value.
        const sinceLocalEdit = Date.now() - lastPathDirEditAtRef.current;
        if (sinceLocalEdit > 3000) setPathDirection(a);
      }
    }
    if (s.manual_controller_v) {
      const v = parseInt(s.manual_controller_v, 10);
      if (v >= 100 && v <= 300) setJoystickSpeed(v);
    }
    if (s.manual_controller_w) {
      const v = parseInt(s.manual_controller_w, 10);
      if (v >= 100 && v <= 300) setJoystickHandling(v);
    }
    if (s.headlight) setHeadlight(s.headlight === '2');
    if (s.sound) setSound(s.sound === '2');

    // Sync the saved-snapshot to whatever the mower currently reports, so
    // the Save button's dirty state resets to clean once the round-trip
    // completes. State setters above use functional updates next render —
    // we read the freshly-derived values here via the same parsing logic
    // so the snapshot mirrors whatever each setter wrote.
    setSavedSnapshot(prev => ({
      ...prev,
      sensitivity: (() => {
        const v = parseInt(s.obstacle_avoidance_sensitivity ?? '', 10);
        return v >= 1 && v <= 3 ? v : prev.sensitivity;
      })(),
      pathDirection: (() => {
        const a = parseInt(s.path_direction ?? '', 10);
        return a >= 0 && a <= 180 ? a : prev.pathDirection;
      })(),
      joystickSpeed: (() => {
        const v = parseInt(s.manual_controller_v ?? '', 10);
        return v >= 100 && v <= 300 ? v : prev.joystickSpeed;
      })(),
      joystickHandling: (() => {
        const v = parseInt(s.manual_controller_w ?? '', 10);
        return v >= 100 && v <= 300 ? v : prev.joystickHandling;
      })(),
      headlight: s.headlight ? s.headlight === '2' : prev.headlight,
      sound: s.sound ? s.sound === '2' : prev.sound,
      cuttingHeight: (() => {
        const h = parseInt(s.defaultCuttingHeight ?? '', 10);
        if (h >= 20 && h <= 90) return h;
        if (h >= 0 && h <= 7) return (h + 2) * 10;
        if (h >= 2 && h <= 9) return h * 10;
        return prev.cuttingHeight;
      })(),
    }));
  }, [mower?.sn, sensorJson]);

  // useHeadlightBrightness hydrates the brightness from SecureStore
  // asynchronously, so the initial savedSnapshot (255) didn't match the
  // hook's value (e.g. last-saved 100) and isDirty stuck at true,
  // popping the "Unsaved changes" dialog on every back-press. Mirror
  // the hook's value into savedSnapshot whenever it changes so the
  // baseline tracks the persisted preference.
  useEffect(() => {
    setSavedSnapshot(prev => prev.headlightBrightness === headlightBrightness
      ? prev
      : { ...prev, headlightBrightness });
  }, [headlightBrightness]);

  const isDirty = sensitivity !== savedSnapshot.sensitivity
    || pathDirection !== savedSnapshot.pathDirection
    || joystickSpeed !== savedSnapshot.joystickSpeed
    || joystickHandling !== savedSnapshot.joystickHandling
    || headlight !== savedSnapshot.headlight
    || headlightBrightness !== savedSnapshot.headlightBrightness
    || sound !== savedSnapshot.sound
    || cuttingHeight !== savedSnapshot.cuttingHeight
    || timezone !== savedSnapshot.timezone;

  const handleSaveAll = useCallback(async () => {
    if (!mowerSn || !mowerOnline) return;
    setSending('save');
    try {
      const url = await getServerUrl();
      if (!url) return;
      const api = new ApiClient(url);
      const params = {
        sound: sound ? 2 : 0,
        headlight: headlight ? headlightBrightness : 0,
        path_direction: pathDirection,
        obstacle_avoidance_sensitivity: sensitivity,
        manual_controller_v: joystickSpeed,
        manual_controller_w: joystickHandling,
      };
      // Single MQTT command carrying every para field — mqtt_node overwrites
      // para.value as one block so omitting a field resets it to 0; sending
      // them together preserves every slider in one shot.
      await api.sendCommand(mowerSn, { set_para_info: params });
      // Push the operator-selected timezone via set_cfg_info. mqtt_node
      // writes this to json_config.json's config.value.tz AND to
      // /userdata/ota/novabot_timezone.txt, keeping both files in sync —
      // issue #56's operator (Paris) was stuck with Amsterdam after BLE
      // provisioning hard-coded NL. Only send when actually changed so
      // we don't trigger mqtt_node's network reset on every save.
      if (timezone && timezone !== savedSnapshot.timezone) {
        await api.sendCommand(mowerSn, { set_cfg_info: { cfg_value: 1, tz: timezone } });
      }
      // Mirror to server sensor cache so values survive a re-open of the
      // screen without waiting for a fresh sensor frame.
      await fetch(`${url}/api/dashboard/sensor-override/${encodeURIComponent(mowerSn)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        ),
      });
      // Cutting height takes its own path (not in set_para_info).
      await fetch(`${url}/api/dashboard/sensor-override/${encodeURIComponent(mowerSn)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultCuttingHeight: String(cuttingHeight) }),
      });
      setSavedSnapshot({
        sensitivity, pathDirection, joystickSpeed, joystickHandling,
        headlight, headlightBrightness, sound, cuttingHeight, timezone,
      });
      // Let the user briefly see "All settings saved" before popping back —
      // mirrors stock Novabot's Confirm flow which also pops the page after
      // a tiny acknowledgement delay.
      setTimeout(() => { navigation.goBack(); }, 700);
    } catch { /* swallow — UI keeps dirty state so user can retry */ }
    finally { setSending(''); }
  }, [mowerSn, mowerOnline, sound, headlight, headlightBrightness, pathDirection, sensitivity, joystickSpeed, joystickHandling, cuttingHeight, timezone, savedSnapshot.timezone, navigation]);

  // Intercept hardware-back / swipe-back / nav.pop when the user has
  // un-saved slider changes. Prompts Cancel / Discard / Save instead of
  // silently dropping them.
  const allowLeaveRef = useRef(false);
  useEffect(() => {
    const unsubscribe = (navigation as unknown as {
      addListener: (event: string, cb: (e: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
    }).addListener('beforeRemove', (e) => {
      if (!isDirty || allowLeaveRef.current) return;
      e.preventDefault();
      appAlertCompat.alert(
        'Unsaved changes',
        'Some settings have not been sent to the mower yet. Save them before leaving?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              allowLeaveRef.current = true;
              (navigation as unknown as { dispatch: (a: unknown) => void }).dispatch(e.data.action);
            },
          },
          {
            text: 'Save',
            onPress: async () => {
              await handleSaveAll();
              // handleSaveAll already pops via goBack after a brief delay,
              // so no manual dispatch needed. Mark allow-leave so the
              // resulting beforeRemove from goBack doesn't re-prompt.
              allowLeaveRef.current = true;
            },
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, isDirty, handleSaveAll]);

  // Load rain auto-pause settings (server-side, not part of the mower's own sensor cache)
  useEffect(() => {
    if (!mowerSn) return;
    (async () => {
      try {
        const url = await getServerUrl();
        if (!url) return;
        const res = await fetch(`${url}/api/dashboard/rain-settings/${encodeURIComponent(mowerSn)}`);
        const data = await res.json() as {
          enabled: boolean; thresholdMm: number; thresholdProbability: number; lookaheadHours: number;
        };
        setRainEnabled(data.enabled);
        setRainMm(data.thresholdMm);
        setRainProb(data.thresholdProbability);
        setRainHours(data.lookaheadHours);
      } catch { /* ignore */ }
    })();
  }, [mowerSn]);

  const saveRain = useCallback(async (patch: Partial<{
    enabled: boolean; thresholdMm: number; thresholdProbability: number; lookaheadHours: number;
  }>) => {
    if (!mowerSn) return;
    if (patch.enabled !== undefined) setRainEnabled(patch.enabled);
    if (patch.thresholdMm !== undefined) setRainMm(patch.thresholdMm);
    if (patch.thresholdProbability !== undefined) setRainProb(patch.thresholdProbability);
    if (patch.lookaheadHours !== undefined) setRainHours(patch.lookaheadHours);
    try {
      const url = await getServerUrl();
      if (!url) return;
      await fetch(`${url}/api/dashboard/rain-settings/${encodeURIComponent(mowerSn)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch { /* ignore */ }
  }, [mowerSn]);

  const handleRainEnabled = (value: boolean) => saveRain({ enabled: value });

  const handleCuttingHeight = (height: number) => {
    setCuttingHeight(height);
  };

  // Local-only handlers — slider drags update state, NOT the mower. mqtt_node
  // treats each `set_para_info` as a full overwrite of `para.value`, so a
  // single-field send (e.g. obstacle_avoidance_sensitivity) clobbers
  // path_direction back to 0. To avoid that, we batch everything behind one
  // explicit Save button at the bottom of the screen (mirrors stock app's
  // "Confirm" workflow).
  const handleSensitivity = (level: number) => {
    setSensitivity(level);
  };

  const handlePathDirection = (angle: number) => {
    lastPathDirEditAtRef.current = Date.now();
    setPathDirection(angle);
  };

  const handleJoystickSpeed = (val: number) => {
    setJoystickSpeed(val);
  };

  const handleJoystickHandling = (val: number) => {
    setJoystickHandling(val);
  };

  const handleHeadlight = (on: boolean) => {
    setHeadlight(on);
  };

  const handleHeadlightBrightness = (val: number) => {
    setHeadlightBrightness(val);
  };

  const handleSound = (on: boolean) => {
    setSound(on);
  };

  const handleRecalibrateChargingPose = useCallback(async () => {
    if (!mowerSn) return;
    appAlertCompat.alert(
      'Recalibrate Charging Pose?',
      'This overwrites map_info.json (charger x/y/θ) on the mower with the CURRENT pose. The mower MUST be physically on its dock and charging, otherwise the mower will place the charger at the wrong spot and future coverage tasks will drift.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recalibrate',
          style: 'destructive',
          onPress: async () => {
            const url = await getServerUrl();
            if (!url) return;
            const api = new ApiClient(url);
            try {
              let resp = await api.recalibrateChargingPose(mowerSn);
              if (!resp.ok && (resp.batteryState ?? '').toUpperCase() !== 'CHARGING') {
                appAlertCompat.alert(
                  'Mower not charging',
                  `Battery state is "${resp.batteryState ?? 'unknown'}" — expected CHARGING. Put the mower on its dock and try again, or override the safety check?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Override',
                      style: 'destructive',
                      onPress: async () => {
                        const forced = await api.recalibrateChargingPose(mowerSn, { force: true });
                        if (forced.ok && forced.pose) {
                          appAlertCompat.alert(
                            'Recalibrated',
                            `New charging pose:\nx=${forced.pose.x.toFixed(3)} y=${forced.pose.y.toFixed(3)} θ=${forced.pose.theta.toFixed(3)}`,
                          );
                        } else {
                          appAlertCompat.alert('Recalibrate failed', forced.error ?? 'unknown error');
                        }
                      },
                    },
                  ],
                );
                return;
              }
              if (resp.ok && resp.pose) {
                appAlertCompat.alert(
                  'Recalibrated',
                  `New charging pose:\nx=${resp.pose.x.toFixed(3)} y=${resp.pose.y.toFixed(3)} θ=${resp.pose.theta.toFixed(3)}`,
                );
              } else {
                appAlertCompat.alert('Recalibrate failed', resp.error ?? 'unknown error');
              }
            } catch (e) {
              appAlertCompat.alert('Recalibrate failed', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  }, [mowerSn]);

  if (!mowerSn) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyState}>
          <Ionicons name="cog-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Mower Connected</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={
        <RefreshControl refreshing={false} tintColor={colors.purple} onRefresh={() => {
          const socket = getSocket();
          if (socket) socket.emit('request:snapshot');
        }} />
      }>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Mower Settings</Text>
        </View>

        {!mowerOnline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={16} color={colors.amber} />
            <Text style={styles.offlineText}>Mower is offline. Connect the mower to change settings.</Text>
          </View>
        )}

        {/* Cutting Height */}
        <View style={[styles.section, !mowerOnline && styles.sectionDisabled]} pointerEvents={mowerOnline ? 'auto' : 'none'}>
          <Text style={styles.sectionTitle}>CUTTING HEIGHT</Text>
          <View style={styles.card}>
            <Text style={styles.currentValue}>{cuttingHeight / 10} cm</Text>
            <View style={styles.chipGrid}>
              {HEIGHT_VALUES.map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[styles.chip, cuttingHeight === h && styles.chipActive]}
                  onPress={() => handleCuttingHeight(h)}
                  disabled={sending === 'height'}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, cuttingHeight === h && styles.chipTextActive]}>
                    {h / 10}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Obstacle Sensitivity */}
        <View style={[styles.section, !mowerOnline && styles.sectionDisabled]} pointerEvents={mowerOnline ? 'auto' : 'none'}>
          <Text style={styles.sectionTitle}>OBSTACLE AVOIDANCE</Text>
          <View style={styles.card}>
            {SENSITIVITY_LEVELS.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.optionRow, sensitivity === s.value && styles.optionRowActive]}
                onPress={() => handleSensitivity(s.value)}
                disabled={sending === 'sensitivity'}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, sensitivity === s.value && styles.radioActive]}>
                  {sensitivity === s.value && <View style={styles.radioInner} />}
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionLabel, sensitivity === s.value && styles.optionLabelActive]}>
                    {s.label}
                  </Text>
                  <Text style={styles.optionDesc}>{s.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Path Direction */}
        <View style={[styles.section, !mowerOnline && styles.sectionDisabled]} pointerEvents={mowerOnline ? 'auto' : 'none'}>
          <Text style={styles.sectionTitle}>MOWING DIRECTION</Text>
          <View style={styles.card}>
            <View style={styles.previewRow}>
              <MowingDirectionPreview direction={pathDirection} size={100} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.currentValue}>{pathDirection}°</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => handlePathDirection(Math.max(0, pathDirection - 15))}>
                    <Ionicons name="remove" size={20} color={colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => handlePathDirection(Math.min(180, pathDirection + 15))}>
                    <Ionicons name="add" size={20} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Joystick Speed */}
        <View style={[styles.section, !mowerOnline && styles.sectionDisabled]} pointerEvents={mowerOnline ? 'auto' : 'none'}>
          <Text style={styles.sectionTitle}>JOYSTICK MAX SPEED</Text>
          <View style={styles.card}>
            <View style={styles.chipGrid}>
              {CONTROLLER_LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.value}
                  style={[styles.chip, joystickSpeed === l.value && styles.chipActive]}
                  onPress={() => handleJoystickSpeed(l.value)}
                  disabled={sending === 'all'}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, joystickSpeed === l.value && styles.chipTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Joystick Handling */}
        <View style={[styles.section, !mowerOnline && styles.sectionDisabled]} pointerEvents={mowerOnline ? 'auto' : 'none'}>
          <Text style={styles.sectionTitle}>JOYSTICK HANDLING</Text>
          <View style={styles.card}>
            <View style={styles.chipGrid}>
              {CONTROLLER_LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.value}
                  style={[styles.chip, joystickHandling === l.value && styles.chipActive]}
                  onPress={() => handleJoystickHandling(l.value)}
                  disabled={sending === 'all'}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, joystickHandling === l.value && styles.chipTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Rain auto-pause */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RAIN AUTO-PAUSE</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => void handleRainEnabled(!rainEnabled)}
              activeOpacity={0.7}
            >
              <Ionicons name="rainy-outline" size={20} color={rainEnabled ? colors.emerald : colors.textMuted} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.optionLabel}>Pause when raining</Text>
                <Text style={styles.optionSub}>
                  {rainEnabled
                    ? `≥ ${rainMm.toFixed(1)} mm or ≥ ${rainProb}% within ${(rainHours * 60) | 0} min`
                    : 'Mower will keep mowing in the rain'}
                </Text>
              </View>
              <View style={[styles.toggle, rainEnabled && styles.toggleActive]}>
                <View style={[styles.toggleThumb, rainEnabled && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
            {rainEnabled && (
              <>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>Min rainfall</Text>
                  <Text style={styles.sliderValue}>{rainMm.toFixed(1)} mm</Text>
                </View>
                <View style={styles.chipGrid}>
                  {[0.1, 0.2, 0.5, 1.0, 2.0].map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.chip, Math.abs(rainMm - v) < 0.05 && styles.chipActive]}
                      onPress={() => void saveRain({ thresholdMm: v })}
                    >
                      <Text style={[styles.chipText, Math.abs(rainMm - v) < 0.05 && styles.chipTextActive]}>
                        {v.toFixed(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>Min probability</Text>
                  <Text style={styles.sliderValue}>{rainProb}%</Text>
                </View>
                <View style={styles.chipGrid}>
                  {[30, 50, 70, 90].map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.chip, rainProb === v && styles.chipActive]}
                      onPress={() => void saveRain({ thresholdProbability: v })}
                    >
                      <Text style={[styles.chipText, rainProb === v && styles.chipTextActive]}>{v}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>Look ahead</Text>
                  <Text style={styles.sliderValue}>{(rainHours * 60) | 0} min</Text>
                </View>
                <View style={styles.chipGrid}>
                  {[0.5, 1, 2, 3].map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.chip, Math.abs(rainHours - v) < 0.05 && styles.chipActive]}
                      onPress={() => void saveRain({ lookaheadHours: v })}
                    >
                      <Text style={[styles.chipText, Math.abs(rainHours - v) < 0.05 && styles.chipTextActive]}>
                        {v < 1 ? `${(v * 60) | 0}m` : `${v}h`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* Headlight & Sound */}
        <View style={[styles.section, !mowerOnline && styles.sectionDisabled]} pointerEvents={mowerOnline ? 'auto' : 'none'}>
          <Text style={styles.sectionTitle}>OTHER</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.optionRow} onPress={() => handleHeadlight(!headlight)} activeOpacity={0.7}>
              <Ionicons name={headlight ? 'flashlight' : 'flashlight-outline'} size={20} color={headlight ? colors.amber : colors.textMuted} />
              <Text style={[styles.optionLabel, { flex: 1, marginLeft: 12 }]}>Headlight</Text>
              <View style={[styles.toggle, headlight && styles.toggleActive]}>
                <View style={[styles.toggleThumb, headlight && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <SimpleSlider
                label="Brightness"
                valueSuffix=""
                min={0}
                max={255}
                step={1}
                value={headlightBrightness}
                fillColor={headlight ? colors.amber : 'rgba(245,158,11,0.4)'}
                onChange={setHeadlightBrightness}
                onCommit={handleHeadlightBrightness}
              />
            </View>
            <TouchableOpacity style={styles.optionRow} onPress={() => handleSound(!sound)} activeOpacity={0.7}>
              <Ionicons name={sound ? 'volume-high' : 'volume-mute'} size={20} color={sound ? colors.emerald : colors.textMuted} />
              <Text style={[styles.optionLabel, { flex: 1, marginLeft: 12 }]}>Speaker</Text>
              <View style={[styles.toggle, sound && styles.toggleActive]}>
                <View style={[styles.toggleThumb, sound && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={() => setTzPickerOpen(true)} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.optionLabel}>Timezone</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {timezone}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Timezone picker modal — operator picks IANA zone, sent via
            set_cfg_info on Save (mqtt_node writes json_config.json +
            novabot_timezone.txt). Auto-detected device tz is pinned to
            the top so the common case is one tap. */}
        <Modal
          visible={tzPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setTzPickerOpen(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
            activeOpacity={1}
            onPress={() => setTzPickerOpen(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 420, maxHeight: '80%', backgroundColor: colors.cardBg, borderRadius: 16, padding: 16 }}
            >
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Select timezone</Text>
              <FlatList
                data={(() => {
                  const detected = detectDeviceTimezone();
                  const list = [detected, ...COMMON_TIMEZONES.filter(tz => tz !== detected)];
                  return list;
                })()}
                keyExtractor={(item) => item}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    onPress={() => { setTimezone(item); setTzPickerOpen(false); }}
                    style={{
                      paddingVertical: 12, paddingHorizontal: 12,
                      borderRadius: 8,
                      backgroundColor: item === timezone ? 'rgba(16,185,129,0.15)' : 'transparent',
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {index === 0 && (
                        <Ionicons name="locate" size={14} color={colors.emerald} style={{ marginRight: 6 }} />
                      )}
                      <Text style={{ color: item === timezone ? colors.emerald : colors.text, fontSize: 14, flex: 1 }}>
                        {item}
                      </Text>
                      {item === timezone && (
                        <Ionicons name="checkmark" size={18} color={colors.emerald} />
                      )}
                    </View>
                    {index === 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 20, marginTop: 2 }}>
                        Auto-detected from this device
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 480 }}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Sticky Save button — collects EVERY slider value and sends one
            `set_para_info` so mqtt_node never resets the rest of the para
            block to 0. Disabled when offline or nothing changed. */}
        <View style={styles.saveBarWrap} pointerEvents="box-none">
          <TouchableOpacity
            onPress={handleSaveAll}
            disabled={!mowerOnline || !isDirty || sending === 'save'}
            style={[
              styles.saveButton,
              (!mowerOnline || !isDirty || sending === 'save') && styles.saveButtonDisabled,
            ]}
            activeOpacity={0.85}
          >
            <Ionicons
              name={sending === 'save' ? 'sync' : 'save-outline'}
              size={18}
              color={colors.white}
            />
            <Text style={styles.saveButtonText}>
              {sending === 'save' ? 'Saving…' : isDirty ? 'Save changes' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recovery — recalibrate charging pose when coverage drifts. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECOVERY</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => handleRecalibrateChargingPose()}
              activeOpacity={0.7}
            >
              <Ionicons name="compass-outline" size={20} color={colors.red} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.optionLabel}>Recalibrate Charging Pose</Text>
                <Text style={styles.optionSub}>
                  Overwrites map_info.json with current pose. Put mower on dock first — mower must be CHARGING.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 24, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', color: c.text },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: c.text, marginTop: 16 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 12, marginBottom: 20,
  },
  offlineText: { flex: 1, fontSize: 13, color: c.amber, lineHeight: 18 },
  section: { marginBottom: 24 },
  sectionDisabled: { opacity: 0.3 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: c.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: c.card, borderRadius: 16,
    borderWidth: 1, borderColor: c.cardBorder, padding: 16,
  },
  currentValue: {
    fontSize: 32, fontWeight: '700', color: c.emerald,
    textAlign: 'center', marginBottom: 16, fontVariant: ['tabular-nums'],
  },
  chipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
    marginBottom: 8,
  },
  optionSub: {
    fontSize: 12, color: c.textMuted, marginTop: 2,
  },
  sliderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, marginBottom: 6, paddingHorizontal: 4,
  },
  sliderLabel: { fontSize: 13, color: c.textDim, fontWeight: '500' },
  sliderValue: { fontSize: 13, color: c.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: { backgroundColor: c.emerald },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textDim },
  chipTextActive: { color: c.text },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
    borderRadius: 12, marginBottom: 6,
  },
  optionRowActive: { backgroundColor: 'rgba(0,212,170,0.08)' },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: c.textMuted, alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: c.emerald },
  radioInner: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: c.emerald,
  },
  optionInfo: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '600', color: c.text },
  optionLabelActive: { color: c.emerald },
  optionDesc: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  previewRow: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  directionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textDim,
  },
  compassGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
  },
  compassChip: {
    width: 64, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  compassChipActive: { backgroundColor: c.purple },
  compassText: { fontSize: 16, fontWeight: '700', color: c.textDim },
  compassTextActive: { color: c.text },
  compassAngle: { fontSize: 10, color: c.textMuted, marginTop: 2 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  toggle: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: c.emerald,
  },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: c.textMuted,
  },
  toggleThumbActive: {
    backgroundColor: c.white,
    alignSelf: 'flex-end',
  },
  saveBarWrap: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: c.emerald,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  saveButtonText: {
    color: c.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
