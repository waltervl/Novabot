#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const loraCpp = fs.readFileSync(path.join(root, "src", "walker_lora.cpp"), "utf8");
const mainCpp = fs.readFileSync(path.join(root, "src", "main.cpp"), "utf8");
const gnssTxCpp = fs.readFileSync(path.join(root, "src", "gnss_tx.cpp"), "utf8");
const rtcmLogCpp = fs.readFileSync(path.join(root, "src", "rtcm_log.cpp"), "utf8");

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
  "forwardLoraCorrectionBytes(g_payloadBuf, g_payloadIdx);",
  "LoRa 0x31 relay must forward the charger payload through the runtime-selected GNSS TX path."
);

assertIncludes(
  loraCpp,
  "forwardLoraCorrectionBytes(g_rtcmBuf, g_rtcmExpectedLen);",
  "LoRa RTCM-only feed policy must forward complete CRC-valid RTCM3 frames through the same selectable TX path."
);

assertIncludes(
  loraCpp,
  "walkerGnssTxQueueRtcmFromLora(bytes, len);",
  "LoRa diagnostics must preserve the queued GNSS TX path for normal operation."
);

assertIncludes(
  loraCpp,
  "static volatile bool g_rtcmOnlyFeed = true;",
  "LoRa feed policy must default to rtcm_only and be switchable at runtime."
);

assertIncludes(
  mainCpp,
  "bool     loraRtcmOnlyFeed  = true;",
  "Runtime config must default new walkers to RTCM-only LoRa forwarding."
);

assertIncludes(
  mainCpp,
  "prefs.getBool(\"lora_rtcm\", true)",
  "Existing walkers without an NVS feed-policy value must boot in RTCM-only mode."
);

assertIncludes(
  loraCpp,
  "void walkerLoraSetRtcmOnlyFeed(bool enabled)",
  "LoRa feed policy must have a runtime setter so outdoor tests can switch without reflashing."
);

assertIncludes(
  loraCpp,
  "static volatile bool g_directGnssWrite = false;",
  "LoRa GNSS TX mode must default to queued and be switchable for legacy direct-write diagnostics."
);

assertIncludes(
  loraCpp,
  "static void noteRtcmType(uint16_t msgType, uint32_t nowMs)",
  "LoRa diagnostics must keep per-RTCM-type counters and gap timing for movement-drop analysis."
);

assertIncludes(
  loraCpp,
  "static bool shouldDropRtcmType(uint16_t msgType)",
  "LoRa RTCM router must support runtime message-type filtering for constellation isolation tests."
);

assertIncludes(
  loraCpp,
  "walkerLoraSetRtcmDropTypes",
  "LoRa RTCM drop filter must be switchable at runtime without reflashing."
);

assertIncludes(
  loraCpp,
  "g_rtcmFilteredMessages++",
  "LoRa diagnostics must count RTCM frames filtered out of the LC29 feed."
);

assertIncludes(
  mainCpp,
  "static void updateGgaStatusFromLine(const char* line, size_t len)",
  "GNSS status must update from every completed GGA sentence, not only TinyGPS location updates."
);

assertIncludes(
  mainCpp,
  "JsonObject gnss = doc[\"gnss\"].to<JsonObject>();",
  "Status API must expose LC29-side GGA diagnostics for RTK drop analysis."
);

assertIncludes(
  rtcmLogCpp,
  "#define RTCM_LOG_SIZE 4096",
  "RTCM debug ring must be large enough to capture 10 s reference bursts for movement-drop analysis."
);

assertIncludes(
  mainCpp,
  "server.hasArg(\"bytes\")",
  "RTCM log endpoint must allow explicit larger diagnostic captures without making the Web UI default heavy."
);

assertIncludes(
  mainCpp,
  "bytesRequested",
  "RTCM log response must report the requested diagnostic capture size."
);

assertIncludes(
  mainCpp,
  "rtcmDropTypes",
  "LoRa config API must expose runtime RTCM message-type drops."
);

assertIncludes(
  mainCpp,
  "walkerLoraSetRtcmDropTypes",
  "LoRa config API must apply RTCM drop types immediately without reboot."
);

assertIncludes(
  loraCpp,
  "void walkerLoraSetDirectGnssWrite(bool enabled)",
  "LoRa GNSS TX mode must have a runtime setter so outdoor tests can switch without reflashing."
);

assertIncludes(
  loraCpp,
  "gnssSerial.write(bytes, len);",
  "LoRa diagnostics must preserve a legacy direct-write path to compare against the stable RTK relay."
);

assertIncludes(
  mainCpp,
  "doc[\"rtcmOnlyFeed\"] = cfg.loraRtcmOnlyFeed;",
  "LoRa config API must expose the runtime RTCM-only feed policy."
);

assertIncludes(
  mainCpp,
  "doc[\"txMode\"] = cfg.loraDirectGnssWrite ? \"legacy_direct\" : \"queued\";",
  "LoRa config API must expose the runtime GNSS TX mode."
);

// ── Correction-source switch (LoRa ↔ NTRIP) ──────────────────────────────
assertIncludes(
  mainCpp,
  "doc[\"correctionSource\"] = cfg.useNtripCorrections ? \"ntrip\" : \"lora\";",
  "Config API must expose the runtime correction-source selector (lora/ntrip)."
);

assertIncludes(
  mainCpp,
  "prefs.getBool(\"corr_ntrip\", false)",
  "Correction source must persist in NVS and default to LoRa (existing walkers keep current behavior)."
);

assertIncludes(
  mainCpp,
  "walkerLoraSetFeedToGnss(!cfg.useNtripCorrections);",
  "Boot must gate the LoRa GNSS feed by the persisted correction source."
);

assertIncludes(
  loraCpp,
  "void walkerLoraSetFeedToGnss(bool enabled)",
  "LoRa must expose a runtime setter to stop feeding the GNSS when NTRIP is the active source."
);

assertIncludes(
  loraCpp,
  "if (!g_feedGnss) return;",
  "LoRa correction forward must skip the GNSS write when its feed is disabled (NTRIP active)."
);

assertIncludes(
  mainCpp,
  "if (!useNtrip) return false;",
  "NTRIP must run only when it is the explicitly selected correction source."
);

assertIncludes(
  mainCpp,
  "size_t freeSlots = walkerGnssTxFreeSlots();",
  "NTRIP must backpressure on free GNSS-TX queue slots so bursty corrections never overflow/drop (garbled RTCM → no fix)."
);

assertIncludes(
  gnssTxCpp,
  "size_t walkerGnssTxFreeSlots()",
  "GNSS TX queue must expose free-slot count for source backpressure."
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
  "LoRa relay must use the observed RTCM router path, not the removed direct raw parser helper."
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
