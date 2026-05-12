#!/usr/bin/env node
/**
 * Strip PII (email, userId, activation/import timestamps, _queried*) from
 * `research/cloud_devices.json` and emit `research/cloud_devices_anonymous.json`.
 * The anonymized file is what ships with the server image and seeds
 * `device_factory` at startup, so re-run this after every cloud_scanner.js
 * harvest.
 *
 * Fields kept (per existing anonymized file shape):
 *   sn, deviceType, macAddress, equipmentType, sysVersion,
 *   chargerAddress, chargerChannel, account, password, model
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.resolve(__dirname, 'cloud_devices.json');
// Write to BOTH locations: research/ is the canonical scrape-pipeline output,
// server/ is what the Dockerfile COPYs into the runtime image. Keep them in
// lockstep — earlier mismatches shipped a stale factory list inside docker
// while the repo looked up-to-date.
const OUTPUTS = [
  path.resolve(__dirname, 'cloud_devices_anonymous.json'),
  path.resolve(__dirname, '..', 'server', 'cloud_devices_anonymous.json'),
];

const KEEP = [
  'sn', 'deviceType', 'macAddress', 'equipmentType', 'sysVersion',
  'chargerAddress', 'chargerChannel', 'account', 'password', 'model',
];

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
const anon = raw.map((d) => {
  const out = {};
  for (const k of KEEP) out[k] = d[k] === undefined ? null : d[k];
  return out;
});

// Sort by SN so diffs across runs are stable.
anon.sort((a, b) => (a.sn ?? '').localeCompare(b.sn ?? ''));

const payload = JSON.stringify(anon, null, 2);
for (const out of OUTPUTS) {
  fs.writeFileSync(out, payload);
  console.log(`Wrote ${anon.length} anonymized entries to ${out}`);
}
