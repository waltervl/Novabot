#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const loraCpp = fs.readFileSync(path.join(root, "src", "walker_lora.cpp"), "utf8");
const mainCpp = fs.readFileSync(path.join(root, "src", "main.cpp"), "utf8");
const gnssTxCpp = fs.readFileSync(path.join(root, "src", "gnss_tx.cpp"), "utf8");

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
  "walkerGnssTxQueueRtcmFromLora(g_payloadBuf, g_payloadIdx);",
  "LoRa 0x31 relay must enqueue the charger payload through the single GNSS TX owner."
);

assertExcludes(
  loraCpp,
  "gnssSerial.write",
  "LoRa code must not write directly to the LC29HDA UART."
);

assertIncludes(
  gnssTxCpp,
  "g_serial->availableForWrite()",
  "GNSS TX owner must respect UART TX buffer capacity instead of blocking the realtime pump."
);

assertIncludes(
  gnssTxCpp,
  "g_serial->write(g_active.bytes + g_activeOffset, n);",
  "GNSS TX owner must contain the single LC29HDA write call site."
);

assertIncludes(
  mainCpp,
  "walkerGnssTxPump();",
  "Realtime GNSS pump must drain the GNSS TX queue."
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

assertExcludes(
  mainCpp,
  "sendGnssCommand(\"PAIR400,2\")",
  "PAIR400,2 selects SBAS in Quectel protocol v1.4 and must not be sent automatically."
);

assertExcludes(
  mainCpp,
  "sendGnssCommand(\"PAIR513\")",
  "PAIR513 must not be sent automatically on every boot."
);

console.log("LoRa relay regression check passed");
