/**
 * ManualJoystick — self-contained circular touch joystick for manual mower control.
 *
 * Faithful copy of the joystick in JoystickScreen.tsx (gesture handling,
 * socket events, speed levels, getHoldType, dead-zone, throttle, sign conventions).
 *
 * Socket events emitted:
 *   joystick:start  { sn, holdType }
 *   joystick:move   { sn, holdType, mst: { x_w, y_v, z_g: 0 } }
 *   joystick:stop   { sn }
 *
 * x_w = angular  (signed, from dx * angular_scale)  — negative = turn left
 * y_v = linear   (signed, from -dy * linear_scale)  — negative = backward
 * z_g = 0        (always)
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useStyles, useTheme, type Colors } from '../theme';
import { useI18n } from '../i18n';
import { getSocket } from '../services/socket';

const { width: SCREEN_W } = Dimensions.get('window');
// Slightly smaller than JoystickScreen's full-screen pad so it fits inside a modal.
const JOYSTICK_SIZE = Math.min(SCREEN_W * 0.55, 220);
const THUMB_SIZE = 64;
const DEAD_ZONE = 0.05;
const THROTTLE_MS = 80;

// Identical to JoystickScreen — live-proven comfortable speeds.
const SPEED_LEVELS = [
  { labelKey: 'slow',   linear: 0.5, angular: 0.4 },
  { labelKey: 'normal', linear: 1.0, angular: 0.8 },
  { labelKey: 'fast',   linear: 2.0, angular: 1.5 },
];

/** Same getHoldType as JoystickScreen — dominates by axis magnitude. */
function getHoldType(x: number, y: number): number {
  if (Math.abs(y) >= Math.abs(x)) {
    return y < 0 ? 3 : 4; // up = forward(3), down = backward(4)
  }
  return x < 0 ? 1 : 2;   // left(1), right(2)
}

interface Props {
  sn: string;
}

export default function ManualJoystick({ sn }: Props) {
  const { t } = useI18n();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  const [active, setActive]       = useState(false);
  const [thumbX, setThumbX]       = useState(0);
  const [thumbY, setThumbY]       = useState(0);
  const [speedLevel, setSpeedLevel] = useState(1); // default: Normal

  const activeRef    = useRef(false);
  const lastSendRef  = useRef(0);
  const speedRef     = useRef(1);

  useEffect(() => { speedRef.current = speedLevel; }, [speedLevel]);

  // Safety: stop on unmount (modal close / screen nav).
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        const socket = getSocket();
        if (socket) socket.emit('joystick:stop', { sn });
      }
    };
  }, [sn]);

  const sendMove = useCallback((dx: number, dy: number) => {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DEAD_ZONE) return;

    const now = Date.now();
    if (now - lastSendRef.current < THROTTLE_MS) return;
    lastSendRef.current = now;

    const socket = getSocket();
    if (!socket) return;

    const holdType = getHoldType(dx, dy);
    const lvl = SPEED_LEVELS[speedRef.current];
    // Same sign convention as JoystickScreen:
    //   x_w = angular  (dx * angular_scale, signed)
    //   y_v = linear   (-dy * linear_scale, signed — screen Y is inverted)
    //   z_g = 0
    socket.emit('joystick:move', {
      sn,
      holdType,
      mst: {
        x_w: Math.round(dx * lvl.angular * 100) / 100,
        y_v: Math.round(-dy * lvl.linear  * 100) / 100,
        z_g: 0,
      },
    });
  }, [sn]);

  const stopAll = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setThumbX(0);
    setThumbY(0);
    const socket = getSocket();
    if (socket) socket.emit('joystick:stop', { sn });
  }, [sn]);

  const radius = JOYSTICK_SIZE / 2;

  const handleGestureStart = useCallback((x: number, y: number) => {
    activeRef.current = true;
    setActive(true);
    lastSendRef.current = 0;

    let dx = x - radius;
    let dy = y - radius;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
    const nx = dx / radius;
    const ny = dy / radius;
    setThumbX(dx);
    setThumbY(dy);

    const socket = getSocket();
    if (socket) {
      const holdType = getHoldType(nx, ny) || 3;
      socket.emit('joystick:start', { sn, holdType });
      sendMove(nx, ny);
    }
  }, [sn, radius, sendMove]);

  const handleGestureUpdate = useCallback((x: number, y: number) => {
    if (!activeRef.current) return;
    let dx = x - radius;
    let dy = y - radius;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
    setThumbX(dx);
    setThumbY(dy);
    sendMove(dx / radius, dy / radius);
  }, [radius, sendMove]);

  const panGesture = Gesture.Pan()
    .onStart((e) => { runOnJS(handleGestureStart)(e.x, e.y); })
    .onUpdate((e) => { runOnJS(handleGestureUpdate)(e.x, e.y); })
    .onEnd(() => { runOnJS(stopAll)(); })
    .onFinalize(() => { runOnJS(stopAll)(); });

  const dist = Math.sqrt(thumbX * thumbX + thumbY * thumbY) / radius;
  const lvl = SPEED_LEVELS[speedLevel];
  const speedMs = (dist * lvl.linear).toFixed(2);

  return (
    <GestureHandlerRootView style={{ alignSelf: 'stretch' }}>
      {/* Speed readout */}
      <View style={styles.speedInfo}>
        {active ? (
          <Text style={styles.speedText}>{speedMs} m/s</Text>
        ) : (
          <Text style={[styles.speedText, { color: colors.textMuted }]}>{t('dragToMove')}</Text>
        )}
      </View>

      {/* Joystick pad */}
      <View style={styles.joystickContainer}>
        <GestureDetector gesture={panGesture}>
          <View style={[styles.joystickBase, { width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }]}>
            {/* Crosshair */}
            <View style={styles.crossV} />
            <View style={styles.crossH} />

            {/* Direction labels */}
            <Text style={[styles.dirLabel, styles.dirTop]}>F</Text>
            <Text style={[styles.dirLabel, styles.dirBottom]}>B</Text>
            <Text style={[styles.dirLabel, styles.dirLeft]}>L</Text>
            <Text style={[styles.dirLabel, styles.dirRight]}>R</Text>

            {/* Thumb */}
            <View
              style={[
                styles.thumb,
                active && styles.thumbActive,
                { transform: [{ translateX: thumbX }, { translateY: thumbY }] },
              ]}
            />
          </View>
        </GestureDetector>
      </View>

      {/* Speed level selector */}
      <View style={styles.speedRow}>
        {SPEED_LEVELS.map((sl, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.speedBtn, speedLevel === i && styles.speedBtnActive]}
            onPress={() => setSpeedLevel(i)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={i === 0 ? 'speedometer-outline' : i === 1 ? 'speedometer' : 'flash'}
              size={16}
              color={speedLevel === i ? colors.white : colors.textMuted}
            />
            <Text style={[styles.speedBtnText, speedLevel === i && { color: colors.white }]}>
              {t(sl.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </GestureHandlerRootView>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  speedInfo: {
    marginVertical: 6,
    height: 22,
    alignItems: 'center',
  },
  speedText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.emerald,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  joystickContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  joystickBase: {
    borderRadius: JOYSTICK_SIZE / 2,
    backgroundColor: 'rgba(125,125,125,0.10)',
    borderWidth: 3,
    borderColor: 'rgba(125,125,125,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(125,125,125,0.30)',
  },
  crossH: {
    position: 'absolute',
    height: 1,
    width: '100%',
    backgroundColor: 'rgba(125,125,125,0.30)',
  },
  dirLabel: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
    color: c.textMuted,
  },
  dirTop:    { top: 8, alignSelf: 'center' },
  dirBottom: { bottom: 8, alignSelf: 'center' },
  dirLeft:   { left: 10, top: '50%', marginTop: -7 },
  dirRight:  { right: 10, top: '50%', marginTop: -7 },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: 'rgba(125,125,125,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(125,125,125,0.55)',
  },
  thumbActive: {
    backgroundColor: c.emerald,
    borderColor: c.white,
    shadowColor: c.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    justifyContent: 'center',
  },
  speedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  speedBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: c.emerald,
  },
  speedBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textMuted,
  },
});
