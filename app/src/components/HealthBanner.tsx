/**
 * HealthBanner — surfaces server-computed health flags (LoRa pair mismatch,
 * mower_error gateway state) for the active mower so the user does not have
 * to dig into logs to know why mapping / mowing is misbehaving.
 *
 * Renders nothing when health is OK so the banner only appears when the
 * server actually has something to say. Tap-through is intentional — the
 * banner is informational; resolution happens through the LoRa editor on
 * the admin page or by waiting for the firmware to recover (mower_error
 * clears itself once the LoRa link reports valid telemetry).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DeviceHealth } from '../types';
import { useStyles, type Colors } from '../theme';

interface Props {
  health?: DeviceHealth | null;
}

export function HealthBanner({ health }: Props) {
  const styles = useStyles(makeStyles);

  if (!health) return null;

  const issues: string[] = [];
  if (health.loraPair && !health.loraPair.ok && health.loraPair.charger && health.loraPair.mower) {
    const mismatchFields: string[] = [];
    if (health.loraPair.issues.includes('addr-mismatch')) mismatchFields.push('address');
    if (health.loraPair.issues.includes('channel-mismatch')) mismatchFields.push('channel');
    if (mismatchFields.length > 0) {
      issues.push(
        `LoRa ${mismatchFields.join(' + ')} mismatch: ` +
          `charger ${health.loraPair.charger.addr}/ch${health.loraPair.charger.channel} vs ` +
          `mower ${health.loraPair.mower.addr}/ch${health.loraPair.mower.channel}`,
      );
    }
  }
  if (health.mowerError) {
    issues.push(`Charger reports mower_error ${health.mowerError.code}: ${health.mowerError.label}`);
  }

  if (issues.length === 0) return null;

  return (
    <View style={styles.container}>
      <Ionicons name="warning" size={18} color="#f87171" style={styles.icon} />
      <View style={styles.textColumn}>
        {issues.map((msg, i) => (
          <Text key={i} style={styles.text}>{msg}</Text>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  icon: { marginTop: 1 },
  textColumn: { flex: 1, gap: 2 },
  text: { color: c.text, fontSize: 12, lineHeight: 17 },
});
