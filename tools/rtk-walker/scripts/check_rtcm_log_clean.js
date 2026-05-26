#!/usr/bin/env node

const fs = require("fs");

const input = fs.readFileSync(0, "utf8");
const payload = JSON.parse(input);
const buf = Buffer.from(payload.hex || "", "hex");

function crc24q(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 16;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x800000) ? ((crc << 1) ^ 0x1864cfb) : (crc << 1);
      crc &= 0xffffff;
    }
  }
  return crc;
}

function rtcmTypes(bytes) {
  const out = [];
  for (let i = 0; i + 6 <= bytes.length; i++) {
    if (bytes[i] !== 0xd3) continue;
    const len = ((bytes[i + 1] & 0x03) << 8) | bytes[i + 2];
    const end = i + 3 + len + 3;
    if (len < 1 || end > bytes.length) continue;
    const want = (bytes[end - 3] << 16) | (bytes[end - 2] << 8) | bytes[end - 1];
    const got = crc24q(bytes.subarray(i, end - 3));
    if (want === got) {
      out.push((bytes[i + 3] << 4) | (bytes[i + 4] >> 4));
      i = end - 1;
    }
  }
  return out;
}

const ascii = buf.toString("latin1");
const nmeaMarkers = ["GNGGA", "GPGGA", "$GNGGA", "$GPGGA", "$PAIR"];
const marker = nmeaMarkers.find((m) => ascii.includes(m));
if (marker) {
  console.error(`RTCM log contains non-RTCM NMEA/proprietary marker: ${marker}`);
  process.exit(1);
}

const types = rtcmTypes(buf);
if (types.length === 0) {
  console.error("RTCM log contains no CRC-valid RTCM3 frame");
  process.exit(1);
}

console.log(`clean RTCM log: ${types.length} frame(s), types=${[...new Set(types)].sort((a, b) => a - b).join(",")}`);
