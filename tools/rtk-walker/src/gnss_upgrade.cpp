// gnss_upgrade.cpp — LC29HDA firmware upgrade over UART (Download Mode).
//
// All multi-byte protocol values are big-endian on the UART per the Quectel
// guide (chapter 2.2 / section 3.1). The 4 firmware blobs go to fixed flash
// addresses that match flash_download.cfg for the DA variant "Other software
// versions":
//   0x08000000 partition_table.bin
//   0x08003000 bootloader.bin       (ag3335_bootloader: terminator byte 0x5A)
//   0x08013000 <Version>.bin        (LC29HDANR11A04S_RSA.bin)
//   0x083DF000 gnss_config.bin
// The DA agent (da_uart_115200.bin) is uploaded to RAM at 0x04204000 and the
// module then jumps to it; after sync, format flash, then send the 4 files.
#include "gnss_upgrade.h"

#include <LittleFS.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <string.h>

// Reuses the global WebServer from main.cpp. In upgrade mode normal setup()
// is skipped, so no routes have been registered yet — we register just the
// progress endpoint here once WiFi associates.
extern WebServer server;

namespace {

// ── Protocol constants (Tables 3 & 6 of the upgrade guide) ───────────────
constexpr uint16_t BROM_ERROR       = 0x1000;
constexpr uint32_t WDT_REG_ADDR     = 0xA2080000;
constexpr uint16_t WDT_VALUE        = 0x0010;
constexpr uint32_t DA_START_ADDR    = 0x04204000;   // UART DA run address
constexpr uint32_t FLASH_START_ADDR = 0x08000000;
constexpr uint32_t FORMAT_LENGTH    = 0x003E0000;   // "Other software versions"
constexpr uint32_t FW_PACKET_LEN    = 4096;         // 0x00001000

// LittleFS paths (uploaded by user before arming).
constexpr const char* FW_DA_PATH   = "/fw_lc29h/da.bin";
constexpr const char* FW_PT_PATH   = "/fw_lc29h/partition_table.bin";
constexpr const char* FW_BL_PATH   = "/fw_lc29h/bootloader.bin";
constexpr const char* FW_MAIN_PATH = "/fw_lc29h/main.bin";
constexpr const char* FW_CFG_PATH  = "/fw_lc29h/config.bin";

constexpr uint32_t FW_PT_ADDR   = 0x08000000;
constexpr uint32_t FW_BL_ADDR   = 0x08003000;
constexpr uint32_t FW_MAIN_ADDR = 0x08013000;
constexpr uint32_t FW_CFG_ADDR  = 0x083DF000;

// ── UART helpers ─────────────────────────────────────────────────────────
HardwareSerial* g_gnss = nullptr;

static inline void txByte(uint8_t b)                       { g_gnss->write(b); }
static inline void txBytes(const uint8_t* buf, size_t len) { g_gnss->write(buf, len); }
static inline void txU16be(uint16_t v) {
  uint8_t b[2] = { (uint8_t)(v >> 8), (uint8_t)v };
  txBytes(b, 2);
}
static inline void txU32be(uint32_t v) {
  uint8_t b[4] = {
    (uint8_t)(v >> 24), (uint8_t)(v >> 16), (uint8_t)(v >> 8), (uint8_t)v };
  txBytes(b, 4);
}

// Forward decl — defined further down with the progress server bits.
static void progTick();
static void progSet(const char* step, int pct, const String& msg);

static bool rxByte(uint8_t& out, uint32_t timeoutMs) {
  uint32_t start = millis();
  uint32_t lastTick = 0;
  while (millis() - start < timeoutMs) {
    if (g_gnss->available()) { out = (uint8_t)g_gnss->read(); return true; }
    // Serve any pending /api/gnss/upgrade/progress requests so the browser
    // stays live. Cheap: a few-tens-of-µs poll + an occasional handleClient().
    uint32_t now = millis();
    if (now - lastTick >= 5) { progTick(); lastTick = now; }
  }
  return false;
}
static bool rxBytes(uint8_t* out, size_t len, uint32_t timeoutMs) {
  uint32_t start = millis();
  uint32_t lastTick = 0;
  size_t got = 0;
  while (got < len && millis() - start < timeoutMs) {
    if (g_gnss->available()) { out[got++] = (uint8_t)g_gnss->read(); continue; }
    uint32_t now = millis();
    if (now - lastTick >= 5) { progTick(); lastTick = now; }
  }
  return got == len;
}
static bool rxU16be(uint16_t& out, uint32_t timeoutMs) {
  uint8_t b[2]; if (!rxBytes(b, 2, timeoutMs)) return false;
  out = ((uint16_t)b[0] << 8) | b[1]; return true;
}
static bool rxU32be(uint32_t& out, uint32_t timeoutMs) {
  uint8_t b[4]; if (!rxBytes(b, 4, timeoutMs)) return false;
  out = ((uint32_t)b[0] << 24) | ((uint32_t)b[1] << 16) |
        ((uint32_t)b[2] << 8)  |  (uint32_t)b[3];
  return true;
}

static bool expectByte(uint8_t expected, uint32_t timeoutMs, const char* what) {
  uint8_t got;
  if (!rxByte(got, timeoutMs)) {
    Serial.printf("[fw-upgrade] %s: timeout (expected 0x%02X)\n", what, expected);
    return false;
  }
  if (got != expected) {
    Serial.printf("[fw-upgrade] %s: got 0x%02X expected 0x%02X\n", what, got, expected);
    return false;
  }
  return true;
}
// Echo a value: tx the bytes, then expect the same bytes back.
static bool sendAndEcho(const uint8_t* buf, size_t len, uint32_t timeoutMs, const char* what) {
  txBytes(buf, len);
  uint8_t resp[8];
  if (len > sizeof(resp)) return false;
  if (!rxBytes(resp, len, timeoutMs)) {
    Serial.printf("[fw-upgrade] %s: echo timeout\n", what);
    return false;
  }
  if (memcmp(buf, resp, len) != 0) {
    Serial.printf("[fw-upgrade] %s: echo mismatch\n", what);
    return false;
  }
  return true;
}
static void drainGnss() { while (g_gnss->available()) g_gnss->read(); }

// Diagnostic info from the most recent handshake attempt, surfaced via the
// /api/gnss/upgrade/progress endpoint so the operator can see what the module
// was actually emitting without needing to attach screen at the right moment
// (early-boot USB-CDC output is lost if the host hasn't enumerated yet).
String g_handshakeDiagHex;
int    g_handshakeDiagCount = 0;


// Single handshake attempt: prime 0xA0 + verify 4-step chain. Returns:
//   true  → handshake OK, ready for WDT / DA upload
//   false → handshake timed out (no 0x5F or wrong follow-up) within budgetMs
// On false, fills the global diag with the first 16 bytes seen so the caller
// can decide whether to reboot+retry (NMEA seen → in firmware mode) or bail
// (silent → UART dead / module not powered).
// budgetMs == 0 means "loop forever" — used by the operator-driven flow
// where the user physically power-cycles the LC29HDA while ESP32 is already
// spamming 0xA0. Caller is responsible for providing an escape route
// (disarm endpoint reboots the ESP32 which kills this loop).
static bool tryHandshake(uint32_t budgetMs) {
  drainGnss();
  uint32_t start = millis();
  uint8_t diagBuf[16] = {0};
  size_t  diagCount = 0;
  uint32_t lastStatusUpdate = 0;
  while (budgetMs == 0 || millis() - start < budgetMs) {
    txByte(0xA0);
    // Keep the HTTP progress server responsive while we spam. progTick is
    // a no-op until WiFi associates + server is up. Without this the
    // operator can't see live status or hit /disarm to escape.
    progTick();
    // Heartbeat in /progress every 2 s so the browser knows we're alive.
    if (budgetMs == 0 && millis() - lastStatusUpdate > 2000) {
      uint32_t elapsed = (millis() - start) / 1000;
      String msg = "spamming 0xA0 forever (";
      msg += elapsed; msg += " s elapsed). ";
      msg += "Power-cycle the LC29HDA NOW (interrupt its VCC or GND for ~500 ms, ";
      msg += "then reconnect). Or POST /api/gnss/upgrade/disarm to escape.";
      progSet("waiting-reset", 2, msg);
      lastStatusUpdate = millis();
    }
    uint32_t t = millis();
    while (millis() - t < 5) {  // tighter loop = more 0xA0s per second
      if (g_gnss->available()) {
        uint8_t b = (uint8_t)g_gnss->read();
        if (b == 0x5F) {
          Serial.println("[fw-upgrade] handshake: 0x5F received, draining stale bytes (5 ms) ...");
          // Some boot transitions leave a few NMEA bytes in the FIFO between
          // the boot-ROM transition and the DM response. Drain briefly so our
          // 0x0A response isn't read as the FIFO leftover.
          uint32_t drainStart = millis();
          while (millis() - drainStart < 5) {
            if (g_gnss->available()) {
              uint8_t junk = (uint8_t)g_gnss->read();
              Serial.printf("[fw-upgrade]   drained stale 0x%02X\n", junk);
            }
          }
          txByte(0x0A);
          if (!expectByte(0xF5, 500, "handshake 0x0A->0xF5")) {
            // Log a few more bytes for context — strongly suggests we're in
            // NMEA mode rather than Download Mode.
            Serial.print("[fw-upgrade]   followup bytes: ");
            uint32_t followupStart = millis();
            int n = 0;
            while (millis() - followupStart < 100 && n < 16) {
              if (g_gnss->available()) {
                Serial.printf("%02X ", (uint8_t)g_gnss->read());
                n++;
              }
            }
            Serial.println();
            return false;
          }
          txByte(0x50);
          if (!expectByte(0xAF, 500, "handshake 0x50->0xAF")) return false;
          txByte(0x05);
          if (!expectByte(0xFA, 500, "handshake 0x05->0xFA")) return false;
          Serial.println("[fw-upgrade] handshake: OK");
          return true;
        }
        // Anything else (stale NMEA from a running module, etc.) — keep priming
        // but stash a snapshot so we can dump it on overall timeout.
        if (diagCount < sizeof(diagBuf)) diagBuf[diagCount++] = b;
      }
    }
  }
  // Stash the diagnostic so /api/gnss/upgrade/progress can echo it back —
  // early USB-CDC output is lost if screen isn't attached yet.
  g_handshakeDiagCount = diagCount;
  g_handshakeDiagHex   = "";
  for (size_t i = 0; i < diagCount; i++) {
    char hex[4]; snprintf(hex, sizeof(hex), "%02X ", diagBuf[i]);
    g_handshakeDiagHex += hex;
  }
  Serial.printf("[fw-upgrade] handshake: timeout after %ums. First bytes: %s\n",
                (unsigned)budgetMs, g_handshakeDiagHex.c_str());
  return false;
}

// Quick handshake attempt — covers the case where the operator physically
// power-cycled USB AND the ESP32 happened to boot fast enough to win the
// 150 ms race. Returns fast on failure so we can bring WiFi+server up and
// fall into the operator-driven slow path.
static bool doHandshake() {
  Serial.println("[fw-upgrade] handshake: quick 0xA0 burst (3 s) ...");
  return tryHandshake(3000);
}

// ── 2.2.2 Disable WDT ────────────────────────────────────────────────────
static bool disableWdt() {
  Serial.println("[fw-upgrade] WDT: disabling ...");
  txByte(0xD2);
  if (!expectByte(0xD2, 500, "WDT cmd echo")) return false;

  uint8_t addr[4] = {
    (uint8_t)(WDT_REG_ADDR >> 24), (uint8_t)(WDT_REG_ADDR >> 16),
    (uint8_t)(WDT_REG_ADDR >> 8),  (uint8_t)WDT_REG_ADDR };
  if (!sendAndEcho(addr, 4, 500, "WDT register address")) return false;

  uint8_t one[4] = { 0x00, 0x00, 0x00, 0x01 };
  if (!sendAndEcho(one, 4, 500, "WDT cmd value")) return false;

  uint16_t status;
  if (!rxU16be(status, 500)) { Serial.println("[fw-upgrade] WDT: status1 timeout"); return false; }
  if (status >= BROM_ERROR)  { Serial.printf("[fw-upgrade] WDT: status1=0x%04X\n", status); return false; }

  uint8_t wv[2] = { (uint8_t)(WDT_VALUE >> 8), (uint8_t)WDT_VALUE };
  if (!sendAndEcho(wv, 2, 500, "WDT value")) return false;

  if (!rxU16be(status, 500)) { Serial.println("[fw-upgrade] WDT: status2 timeout"); return false; }
  if (status >= BROM_ERROR)  { Serial.printf("[fw-upgrade] WDT: status2=0x%04X\n", status); return false; }

  Serial.println("[fw-upgrade] WDT: disabled");
  return true;
}

// XOR of 16-bit little-endian words; trailing odd byte XORed as-is.
// Matches the "Checksum Code of DA File" sample in 2.2.3 of the guide.
static uint16_t daChecksumUpdate(uint16_t c, const uint8_t* buf, size_t len) {
  size_t pairs = len / 2;
  for (size_t i = 0; i < pairs; i++) {
    uint16_t w = (uint16_t)buf[i*2] | ((uint16_t)buf[i*2+1] << 8);
    c ^= w;
  }
  if (len & 1) c ^= buf[len - 1];
  return c;
}

// ── 2.2.3 Send DA file ───────────────────────────────────────────────────
static bool sendDaFile() {
  File f = LittleFS.open(FW_DA_PATH, "r");
  if (!f || f.isDirectory()) {
    Serial.printf("[fw-upgrade] DA: %s missing\n", FW_DA_PATH);
    if (f) f.close();
    return false;
  }
  uint32_t daLen = f.size();
  Serial.printf("[fw-upgrade] DA: %u bytes\n", (unsigned)daLen);

  txByte(0xD7);
  if (!expectByte(0xD7, 500, "DA cmd echo")) { f.close(); return false; }

  uint8_t addr[4] = {
    (uint8_t)(DA_START_ADDR >> 24), (uint8_t)(DA_START_ADDR >> 16),
    (uint8_t)(DA_START_ADDR >> 8),  (uint8_t)DA_START_ADDR };
  if (!sendAndEcho(addr, 4, 500, "DA start addr")) { f.close(); return false; }

  uint8_t lenBuf[4] = {
    (uint8_t)(daLen >> 24), (uint8_t)(daLen >> 16),
    (uint8_t)(daLen >> 8),  (uint8_t)daLen };
  if (!sendAndEcho(lenBuf, 4, 500, "DA length")) { f.close(); return false; }

  uint8_t zero[4] = { 0x00, 0x00, 0x00, 0x00 };
  if (!sendAndEcho(zero, 4, 500, "DA pad zero")) { f.close(); return false; }

  uint16_t status;
  if (!rxU16be(status, 500)) { Serial.println("[fw-upgrade] DA: pre-stream status timeout"); f.close(); return false; }
  if (status >= BROM_ERROR)  { Serial.printf("[fw-upgrade] DA: pre-stream status=0x%04X\n", status); f.close(); return false; }

  Serial.println("[fw-upgrade] DA: streaming 1024B chunks ...");
  uint16_t localCk = 0;
  uint8_t buf[1024];
  uint32_t sent = 0;
  uint32_t lastReport = 0;
  while (sent < daLen) {
    size_t want = daLen - sent;
    if (want > sizeof(buf)) want = sizeof(buf);
    size_t got = f.read(buf, want);
    if (got != want) { Serial.println("[fw-upgrade] DA: file read error"); f.close(); return false; }
    txBytes(buf, got);
    localCk = daChecksumUpdate(localCk, buf, got);
    sent += got;
    delay(20);  // protocol says ~20 ms between chunks
    if (millis() - lastReport > 1000 || sent == daLen) {
      Serial.printf("[fw-upgrade] DA: %u/%u\n", (unsigned)sent, (unsigned)daLen);
      lastReport = millis();
    }
  }
  f.close();

  uint16_t bromCk;
  if (!rxU16be(bromCk, 2000)) { Serial.println("[fw-upgrade] DA: brom checksum timeout"); return false; }
  if (bromCk != localCk) {
    Serial.printf("[fw-upgrade] DA: checksum mismatch (module=0x%04X local=0x%04X)\n", bromCk, localCk);
    return false;
  }
  if (!rxU16be(status, 500)) { Serial.println("[fw-upgrade] DA: post-stream status timeout"); return false; }
  if (status >= BROM_ERROR)  { Serial.printf("[fw-upgrade] DA: post-stream status=0x%04X\n", status); return false; }

  Serial.printf("[fw-upgrade] DA: checksum 0x%04X OK\n", bromCk);
  return true;
}

// ── 2.2.4 Jump to DA ─────────────────────────────────────────────────────
static bool jumpToDa() {
  Serial.println("[fw-upgrade] jump: starting DA ...");
  txByte(0xD5);
  if (!expectByte(0xD5, 500, "jump cmd echo")) return false;

  uint8_t addr[4] = {
    (uint8_t)(DA_START_ADDR >> 24), (uint8_t)(DA_START_ADDR >> 16),
    (uint8_t)(DA_START_ADDR >> 8),  (uint8_t)DA_START_ADDR };
  if (!sendAndEcho(addr, 4, 500, "jump addr")) return false;

  uint16_t status;
  if (!rxU16be(status, 500)) { Serial.println("[fw-upgrade] jump: status timeout"); return false; }
  if (status >= BROM_ERROR)  { Serial.printf("[fw-upgrade] jump: status=0x%04X\n", status); return false; }

  Serial.println("[fw-upgrade] jump: OK — module now running DA");
  return true;
}

// ── 2.2.5 Sync with DA + read DA flash report (UART, baud stays 115200) ──
static bool syncWithDa() {
  Serial.println("[fw-upgrade] sync: DA handshake ...");
  if (!expectByte(0xC0, 1000, "sync wait 0xC0")) return false;

  txByte(0x3F);
  if (!expectByte(0x0C, 500, "sync 0x3F->0x0C")) return false;
  txByte(0xF3);
  if (!expectByte(0x3F, 500, "sync 0xF3->0x3F")) return false;
  txByte(0xC0);
  if (!expectByte(0xF3, 500, "sync 0xC0->0xF3")) return false;

  txU16be(0x0C00);
  uint8_t r3[3];
  if (!rxBytes(r3, 3, 500)) { Serial.println("[fw-upgrade] sync 0x0C00: timeout"); return false; }
  if (r3[0] != 0x5A || r3[1] != 0x69 || r3[2] != 0x69) {
    Serial.printf("[fw-upgrade] sync 0x0C00: got %02X %02X %02X\n", r3[0], r3[1], r3[2]);
    return false;
  }

  txU16be(0x5A00);
  if (!expectByte(0x69, 500, "sync 0x5A00")) return false;
  txByte(0x5A);
  if (!expectByte(0x69, 500, "sync 0x5A->0x69")) return false;

  // The 115200 DA keeps the baud at 115200. Host sends 0x5A then 0xC0
  // back-to-back; module replies 0xC0.
  txByte(0x5A);
  txByte(0xC0);
  if (!expectByte(0xC0, 500, "sync 0xC0 -> 0xC0")) return false;

  txByte(0x5A);
  uint8_t r2[2];
  if (!rxBytes(r2, 2, 500)) { Serial.println("[fw-upgrade] sync 0x5A->0x5A69 timeout"); return false; }
  if (r2[0] != 0x5A || r2[1] != 0x69) {
    Serial.printf("[fw-upgrade] sync 0x5A69: got %02X %02X\n", r2[0], r2[1]);
    return false;
  }

  txByte(0x5A);
  uint16_t flashMfg, flashId1, flashId2;
  uint32_t mountStatus, startAddr, flashSize;
  if (!rxU16be(flashMfg,    500)) { Serial.println("[fw-upgrade] sync: flashMfg");    return false; }
  if (!rxU16be(flashId1,    500)) { Serial.println("[fw-upgrade] sync: flashId1");    return false; }
  if (!rxU16be(flashId2,    500)) { Serial.println("[fw-upgrade] sync: flashId2");    return false; }
  if (!rxU32be(mountStatus, 500)) { Serial.println("[fw-upgrade] sync: mountStatus"); return false; }
  if (!rxU32be(startAddr,   500)) { Serial.println("[fw-upgrade] sync: startAddr");   return false; }
  if (!rxU32be(flashSize,   500)) { Serial.println("[fw-upgrade] sync: flashSize");   return false; }
  if (!expectByte(0x5A, 500, "sync trailing 0x5A")) return false;
  txByte(0x5A);

  Serial.printf("[fw-upgrade] sync OK — flash mfg=0x%04X id=0x%04X/0x%04X mount=0x%08X start=0x%08X size=0x%08X\n",
                flashMfg, flashId1, flashId2,
                (unsigned)mountStatus, (unsigned)startAddr, (unsigned)flashSize);
  if (mountStatus != 0) {
    Serial.printf("[fw-upgrade] WARN: mount status non-zero (0x%08X)\n", (unsigned)mountStatus);
  }
  return true;
}

// ── 2.2.6.1 Format flash via UART ────────────────────────────────────────
static bool formatFlash() {
  Serial.println("[fw-upgrade] format: erasing flash ...");
  uint8_t hdr[2] = { 0xD4, 0x00 };
  txBytes(hdr, 2);
  txU32be(FLASH_START_ADDR);
  txU32be(FORMAT_LENGTH);

  uint8_t ack[2];
  if (!rxBytes(ack, 2, 2000)) { Serial.println("[fw-upgrade] format: 0x5A5A timeout"); return false; }
  if (ack[0] != 0x5A || ack[1] != 0x5A) {
    Serial.printf("[fw-upgrade] format: got %02X %02X (expected 5A 5A)\n", ack[0], ack[1]);
    return false;
  }

  // Loop reading (4-byte status + 1-byte progress) until progress=0x64 and status=0.
  uint32_t lastReport = 0;
  for (;;) {
    uint32_t status32;
    if (!rxU32be(status32, 10000)) { Serial.println("[fw-upgrade] format: status timeout"); return false; }
    uint8_t progress;
    if (!rxByte(progress, 2000)) { Serial.println("[fw-upgrade] format: progress timeout"); return false; }
    txByte(0x5A);  // ack each progress step
    if (millis() - lastReport > 500 || progress >= 0x64) {
      Serial.printf("[fw-upgrade] format: %u%% (status 0x%08X)\n", (unsigned)progress, (unsigned)status32);
      lastReport = millis();
    }
    if (progress >= 0x64 && status32 == 0) break;
  }

  // Final exchange: host sends an extra 0x5A, module replies 0x5A.
  txByte(0x5A);
  if (!expectByte(0x5A, 2000, "format final 0x5A")) return false;
  Serial.println("[fw-upgrade] format: complete");
  return true;
}

// ── 2.2.7.1 Send one FW file via UART ────────────────────────────────────
// FW total length must be a multiple of 4 KB; last packet padded with 0xFF.
// Packet checksum = sum-of-bytes (uint32) per "Checksum Code for FW Packet".
// Total FW checksum = sum of all packet checksums.
// Final byte: 0x5A for ag3335_bootloader.bin, 0xA5 for everything else.
static bool sendFwFile(const char* path, uint32_t flashAddr, bool isBootloader,
                       const char* label) {
  File f = LittleFS.open(path, "r");
  if (!f || f.isDirectory()) {
    Serial.printf("[fw-upgrade] FW %s: %s missing\n", label, path);
    if (f) f.close();
    return false;
  }
  uint32_t fileLen  = f.size();
  uint32_t totalLen = (fileLen + FW_PACKET_LEN - 1) & ~(FW_PACKET_LEN - 1);
  if (totalLen == 0) totalLen = FW_PACKET_LEN;  // protect against empty file
  uint32_t packets  = totalLen / FW_PACKET_LEN;
  Serial.printf("[fw-upgrade] FW %s -> 0x%08X: file=%u, total=%u (%u packets)%s\n",
                label, (unsigned)flashAddr, (unsigned)fileLen,
                (unsigned)totalLen, (unsigned)packets,
                isBootloader ? " [bootloader, term=0x5A]" : "");

  txByte(0xB2);
  txU32be(flashAddr);
  txU32be(totalLen);
  txU32be(FW_PACKET_LEN);

  uint8_t ack[2];
  if (!rxBytes(ack, 2, 2000)) { Serial.printf("[fw-upgrade] FW %s: header ack timeout\n", label); f.close(); return false; }
  if (ack[0] != 0x5A || ack[1] != 0x5A) {
    Serial.printf("[fw-upgrade] FW %s: header ack %02X %02X\n", label, ack[0], ack[1]);
    f.close(); return false;
  }

  // 4 KB per packet. Static to avoid blowing the stack on the bridge task.
  static uint8_t pkt[FW_PACKET_LEN];
  uint32_t totalCk = 0;
  uint32_t lastReport = 0;
  for (uint32_t i = 0; i < packets; i++) {
    size_t got = 0;
    if (f.available()) got = f.read(pkt, FW_PACKET_LEN);
    if (got < FW_PACKET_LEN) memset(pkt + got, 0xFF, FW_PACKET_LEN - got);

    uint32_t pktCk = 0;
    for (size_t j = 0; j < FW_PACKET_LEN; j++) pktCk += pkt[j];

    txBytes(pkt, FW_PACKET_LEN);
    txU32be(pktCk);

    if (!expectByte(0x69, 2000, "FW packet ack")) {
      Serial.printf("[fw-upgrade] FW %s: packet %u/%u 0x69 failed\n",
                    label, (unsigned)(i + 1), (unsigned)packets);
      f.close(); return false;
    }
    totalCk += pktCk;

    if (millis() - lastReport > 500 || i + 1 == packets) {
      Serial.printf("[fw-upgrade] FW %s: %u/%u packets\n",
                    label, (unsigned)(i + 1), (unsigned)packets);
      lastReport = millis();
    }
  }
  f.close();

  if (!expectByte(0x5A, 2000, "FW post-packets 0x5A")) return false;
  txU32be(totalCk);
  if (!expectByte(0x5A, 2000, "FW total-checksum ack")) return false;
  txByte(isBootloader ? 0x5A : 0xA5);
  if (!expectByte(0x5A, 2000, "FW finalize")) return false;

  Serial.printf("[fw-upgrade] FW %s: done (total checksum 0x%08X)\n", label, (unsigned)totalCk);
  return true;
}

// Verify all required files exist and aren't empty before kicking off the
// destructive part of the flow. Cheap insurance against half-uploaded blobs.
static bool verifyFilesPresent() {
  struct { const char* path; const char* label; } files[] = {
    { FW_DA_PATH,   "DA" },
    { FW_PT_PATH,   "partition_table" },
    { FW_BL_PATH,   "bootloader" },
    { FW_MAIN_PATH, "main" },
    { FW_CFG_PATH,  "config" },
  };
  bool ok = true;
  for (auto& fi : files) {
    File f = LittleFS.open(fi.path, "r");
    if (!f || f.isDirectory() || f.size() == 0) {
      Serial.printf("[fw-upgrade] missing/empty: %s (%s)\n", fi.path, fi.label);
      ok = false;
    } else {
      Serial.printf("[fw-upgrade] file %s: %u bytes (%s)\n",
                    fi.label, (unsigned)f.size(), fi.path);
    }
    if (f) f.close();
  }
  return ok;
}

// ── Live progress state + HTTP endpoint ──────────────────────────────────
// Shared with the WebServer lambda. WiFi association is kicked off AFTER the
// timing-critical handshake; once associated, we register /api/gnss/upgrade/
// progress on the global WebServer and the (already-loaded) browser page polls
// it. That replaces the screen /dev/cu.usbmodem* workflow.
String   g_progStep      = "init";
int      g_progPercent   = 0;
String   g_progLastMsg;
bool     g_progFinished  = false;
bool     g_progSuccess   = false;
uint32_t g_progStartedMs = 0;
bool     g_progServerUp  = false;
bool     g_progWifiKickedOff = false;
String   g_progWifiSsid;
String   g_progWifiPass;

static void progSet(const char* step, int pct, const String& msg) {
  if (step) g_progStep = step;
  if (pct >= 0) g_progPercent = pct;
  if (msg.length() > 0) g_progLastMsg = msg;
  Serial.printf("[fw-upgrade] [%-12s %3d%%] %s\n",
                g_progStep.c_str(), g_progPercent, g_progLastMsg.c_str());
}

static void progStartServerIfReady() {
  if (g_progServerUp) return;
  if (WiFi.status() != WL_CONNECTED) return;
  server.on("/api/gnss/upgrade/progress", HTTP_GET, []() {
    JsonDocument doc;
    doc["step"]              = g_progStep;
    doc["percent"]           = g_progPercent;
    doc["lastMsg"]           = g_progLastMsg;
    doc["finished"]          = g_progFinished;
    doc["success"]           = g_progSuccess;
    doc["elapsedMs"]         = (uint32_t)(millis() - g_progStartedMs);
    // Persisted handshake diagnostic — bytes the module emitted during the
    // 15 s prime window. Lets the operator see whether the module is in NMEA
    // mode ($GN... = 24 47 4E ...), boot banner, or completely silent — info
    // that was previously lost when USB-CDC enumeration finished too late.
    doc["handshakeDiagHex"]   = g_handshakeDiagHex;
    doc["handshakeDiagCount"] = g_handshakeDiagCount;
    String out;
    serializeJson(doc, out);
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", out);
  });
  // Rescue endpoint: if upgrade keeps failing the operator needs an easy way
  // out without holding BOOT or attaching esptool. Intentionally unauth —
  // this is a single-operator personal device on the operator's private LAN
  // and the only thing the endpoint does is "clear the gnss_up flag and
  // reboot". CSRF impact is "reboot the walker"; auth/tokens would defeat
  // the emergency-escape purpose for a device whose operator might not have
  // credentials at hand. /progress also doesn't send CORS headers, so a
  // cross-origin page at least can't easily learn the walker is in upgrade
  // mode either.
  server.on("/api/gnss/upgrade/disarm", HTTP_POST, []() {
    Preferences p;
    p.begin("rtk-walker", false);
    p.putBool("gnss_up", false);
    p.end();
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json",
                "{\"ok\":true,\"disarmed\":true,\"next\":\"rebooting to normal walker firmware\"}");
    delay(500);
    ESP.restart();
  });
  server.begin();
  g_progServerUp = true;
  Serial.printf("[fw-upgrade] live progress at http://%s/api/gnss/upgrade/progress\n",
                WiFi.localIP().toString().c_str());
  Serial.printf("[fw-upgrade] disarm     at http://%s/api/gnss/upgrade/disarm  (POST)\n",
                WiFi.localIP().toString().c_str());
}

static void progKickoffWifi() {
  if (g_progWifiKickedOff) return;
  if (g_progWifiSsid.length() == 0) {
    Serial.println("[fw-upgrade] no WiFi SSID configured — live progress over HTTP unavailable (USB-CDC only)");
    g_progWifiKickedOff = true;
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(g_progWifiSsid.c_str(), g_progWifiPass.c_str());
  Serial.printf("[fw-upgrade] WiFi.begin('%s') — associating in background ...\n",
                g_progWifiSsid.c_str());
  g_progWifiKickedOff = true;
}

// Called from every busy-wait loop in the protocol helpers. Brings up the
// progress server lazily once WiFi associates, and drains any pending HTTP
// requests. Cheap when nothing is happening.
static void progTick() {
  progStartServerIfReady();
  if (g_progServerUp) server.handleClient();
}

}  // namespace

// Public: called from main.cpp's idle loop AFTER runGnssUpgrade returns so
// the progress endpoint stays responsive while the operator reads the final
// state in the browser before power-cycling.
void gnssUpgradeServeTick() {
  progTick();
}

// Stashes handshake outcome between phase 1 (runGnssUpgradeHandshake) and
// phase 2 (runGnssUpgradeBody). Split so the caller can defer slow init
// (LittleFS.begin, prefs.getString, etc.) until after the timing-critical
// 0xA0 burst has hit the LC29HDA's ~150 ms boot window.
namespace { bool g_handshakeOk = false; }

// ── Public entry point: phase 1 (handshake only, do this ASAP) ──────────
bool runGnssUpgradeHandshake(HardwareSerial& gnss) {
  g_gnss          = &gnss;
  g_progStartedMs = millis();
  g_progFinished  = false;
  g_progSuccess   = false;
  progSet("init", 0, "starting upgrade");
  Serial.println();
  Serial.println("[fw-upgrade] === LC29HDA firmware upgrade (Download Mode UART) ===");
  progSet("handshake", 2, "priming 0xA0 ASAP (LC29HDA must have just been power-cycled) ...");
  g_handshakeOk = doHandshake();
  return g_handshakeOk;
}

// ── Public entry point: phase 2 (heavyweight, runs after slow init) ─────
bool runGnssUpgradeBody(const String& ssid, const String& pass) {
  g_progWifiSsid = ssid;
  g_progWifiPass = pass;

  // WiFi up now — timing-critical window has long passed.
  progKickoffWifi();

  if (!g_handshakeOk) {
    // The quick handshake (phase 1) didn't catch the boot window. The
    // operator now needs to physically power-cycle just the LC29HDA module
    // (interrupt its VCC or GND briefly, or short RESET_N to GND) while
    // ESP32 keeps spamming 0xA0. We fall into a forever-spam loop here —
    // tryHandshake(0) does progTick() on every iteration so the HTTP
    // server stays responsive and the operator can disarm at any time.
    String msg = "WiFi up, ESP32 spamming 0xA0 forever. ";
    msg += "Power-cycle the LC29HDA NOW (interrupt VCC or GND for ~500 ms, ";
    msg += "then reconnect). Or POST /api/gnss/upgrade/disarm to escape.";
    progSet("waiting-reset", 2, msg);
    Serial.println("[fw-upgrade] Falling into endless 0xA0 spam — operator must "
                   "power-cycle the LC29HDA. POST /disarm to escape.");
    g_handshakeOk = tryHandshake(0);  // 0 = forever
    if (!g_handshakeOk) {
      // tryHandshake(0) can only exit on success — if it ever returns false
      // something went very wrong with the protocol decode (0x5F + bad
      // follow-up). Report and idle.
      String failMsg = "endless handshake exited unexpectedly. ";
      if (g_handshakeDiagCount > 0) {
        failMsg += "Bytes seen: "; failMsg += g_handshakeDiagHex;
      }
      progSet("failed", 100, failMsg);
      g_progFinished = true;
      g_progSuccess  = false;
      return false;
    }
  }

  if (!verifyFilesPresent()) {
    progSet("failed", 100, "missing firmware files — upload them first");
    g_progFinished = true; g_progSuccess = false;
    return false;
  }

  progSet("wdt", 5, "disabling watchdog");
  if (!disableWdt())  { progSet("failed", 100, "WDT off failed"); g_progFinished = true; return false; }

  progSet("da", 7, "uploading download agent (~28 KB)");
  if (!sendDaFile())  { progSet("failed", 100, "DA upload failed"); g_progFinished = true; return false; }

  progSet("jump", 12, "jumping into DA");
  if (!jumpToDa())    { progSet("failed", 100, "jump failed"); g_progFinished = true; return false; }

  progSet("sync", 14, "synchronising with DA + reading flash report");
  if (!syncWithDa())  { progSet("failed", 100, "DA sync failed"); g_progFinished = true; return false; }

  progSet("format", 16, "erasing flash (this is the slow bit)");
  if (!formatFlash()) { progSet("failed", 100, "format flash failed"); g_progFinished = true; return false; }

  progSet("fw-pt", 35, "uploading partition_table.bin");
  if (!sendFwFile(FW_PT_PATH,   FW_PT_ADDR,   false, "partition_table")) {
    progSet("failed", 100, "partition_table upload failed"); g_progFinished = true; return false;
  }
  progSet("fw-bl", 40, "uploading bootloader.bin");
  if (!sendFwFile(FW_BL_PATH,   FW_BL_ADDR,   true,  "bootloader")) {
    progSet("failed", 100, "bootloader upload failed"); g_progFinished = true; return false;
  }
  progSet("fw-main", 45, "uploading LC29HDANR11A04S_RSA.bin (~2.4 MB, this takes a while)");
  if (!sendFwFile(FW_MAIN_PATH, FW_MAIN_ADDR, false, "main")) {
    progSet("failed", 100, "main firmware upload failed"); g_progFinished = true; return false;
  }
  progSet("fw-cfg", 95, "uploading gnss_config.bin");
  if (!sendFwFile(FW_CFG_PATH,  FW_CFG_ADDR,  false, "gnss_config")) {
    progSet("failed", 100, "gnss_config upload failed"); g_progFinished = true; return false;
  }

  Serial.println("[fw-upgrade] === SUCCESS — power-cycle the walker to boot the new module firmware ===");
  progSet("done", 100, "SUCCESS — power-cycle the walker to boot the new module firmware");
  g_progFinished = true;
  g_progSuccess  = true;
  return true;
}

// Convenience all-in-one wrapper. Callers that do NOT need to do their own
// slow init between handshake and body can use this. main.cpp uses the
// split API so it can defer LittleFS.begin / prefs.getString until AFTER
// the timing-critical handshake.
bool runGnssUpgrade(HardwareSerial& gnss, const String& ssid, const String& pass) {
  runGnssUpgradeHandshake(gnss);
  return runGnssUpgradeBody(ssid, pass);
}
