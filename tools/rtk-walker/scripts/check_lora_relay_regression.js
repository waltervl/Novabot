#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const loraCpp = fs.readFileSync(path.join(root, "src", "walker_lora.cpp"), "utf8");
const mainCpp = fs.readFileSync(path.join(root, "src", "main.cpp"), "utf8");

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    console.error(message);
    process.exit(1);
  }
}

function assertExcludes(haystack, needle, message) {
  if (haystack.includes(needle)) {
    console.error(message);
    process.exit(1);
  }
}

assertIncludes(
  loraCpp,
  "gnssSerial.write(g_payloadBuf, g_payloadIdx);",
  "LoRa 0x31 relay must pass the charger payload through to GNSS UART, matching the stable 8a5cd03 behavior."
);

assertExcludes(
  loraCpp,
  "forwardRtcmStreamBytes",
  "LoRa relay must not re-parse the charger payload into RTCM-only fragments; that starves the rover on live frames."
);

assertExcludes(
  mainCpp,
  "setLoraRtcmForwarding(false);",
  "Boot must not start with LoRa correction forwarding disabled."
);

assertExcludes(
  mainCpp,
  "pauseLoraForGnssCommand",
  "PAIR command sends must not pause LoRa correction forwarding."
);

console.log("LoRa relay regression check passed");
