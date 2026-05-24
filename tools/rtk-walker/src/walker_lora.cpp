// walker_lora.cpp — EBYTE E22-900T22S configuration sequence + (Task 3)
// frame parsing. We're a passive listener; never transmit user data.
#include "walker_lora.h"

#ifdef LORA_PRESENT

extern HardwareSerial gnssSerial;
extern HardwareSerial loraSerial;

// Forward to main.cpp's logger so timing aligns with the rest of the
// serial output. weblogf is declared in main.cpp as static — instead
// we just use Serial.printf here; the user has serial access during
// bench bring-up which is the main debugging surface anyway.
static void loraLogf(const char* fmt, ...) {
    char buf[160];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (n < 0) return;
    Serial.print("[lora] ");
    Serial.print(buf);
}

// Build + send the 11-byte EBYTE permanent-save command. Returns true
// if the module echoed back a `0xC1` ACK with matching ADDH/ADDL/CHAN.
// REG0 = 0x62 (UART 9600 8N1, air 2.4 kbps). REG1 = 0x00 (240 B sub-
// packet, 22 dBm, no ambient RSSI). REG2 = channel. REG3 = 0x00 (no
// LBT, transparent mode). NETID = 0 (we don't use netid).
//
// Per EBYTE E22-900T22S datasheet section 5.3 "Register Definition".
// Send 0xC0 = permanent save (NVS), 0xC2 = until power-cycle.
static bool ebyteWriteConfig(const WalkerLoraConfig& cfg) {
    uint8_t addH = (cfg.addr >> 8) & 0xFF;
    uint8_t addL = cfg.addr & 0xFF;
    uint8_t pkt[] = {
        0xC0,        // permanent save
        0x00,        // start register
        0x09,        // 9 bytes of register data follow
        addH, addL,  // ADDH, ADDL
        0x00,        // NETID
        0x62,        // REG0: UART 9600 8N1, air 2.4 kbps
        0x00,        // REG1: 240 B subpacket, +22 dBm, no RSSI
        cfg.channel, // REG2: channel (= freq - base_freq, 1 MHz step)
        0x00,        // REG3: transparent mode, no LBT, WOR 500 ms
        0x00,        // CRYPT_H (no encryption)
        0x00,        // CRYPT_L (no encryption)
    };
    // Make sure module is in config mode.
    digitalWrite(LORA_M0_PIN, HIGH);
    digitalWrite(LORA_M1_PIN, HIGH);
    delay(50);   // EBYTE datasheet: ≥ 40 ms settle after mode change

    // Flush any stale RX bytes before sending.
    while (loraSerial.available()) loraSerial.read();
    loraSerial.write(pkt, sizeof(pkt));
    loraSerial.flush();

    // Expect 12-byte echo starting with 0xC1.
    uint8_t resp[12] = {0};
    uint32_t deadline = millis() + 500;
    size_t got = 0;
    while (got < sizeof(resp) && millis() < deadline) {
        if (loraSerial.available()) {
            resp[got++] = (uint8_t) loraSerial.read();
        } else {
            delay(2);
        }
    }
    if (got < sizeof(resp)) {
        loraLogf("config: short echo (%u bytes)\n", (unsigned) got);
        return false;
    }
    bool ok = (resp[0] == 0xC1) &&
              (resp[3] == addH) && (resp[4] == addL) &&
              (resp[8] == cfg.channel);
    if (!ok) {
        loraLogf("config: bad echo "
                 "%02x %02x %02x  addr=%02x%02x ch=%02x\n",
                 resp[0], resp[1], resp[2], resp[3], resp[4], resp[8]);
    }
    return ok;
}

static bool g_moduleReady = false;
static WalkerLoraConfig g_currentCfg = {718, 17, 20, 14};

// Frame parser state. Resets to WAIT_PRE1 on any malformed byte.
// Frame format (from charger Ghidra decomp, FIRMWARE-CHARGER.md):
//   [0x02 0x02][addr_hi addr_lo][len+1][cmd][payload...][XOR][0x03 0x03]
// where len_byte = 1 + payload_data_count and XOR runs over the
// payload byte count = len_byte bytes (cmd + data).
enum LoraParseState : uint8_t {
    LP_WAIT_PRE1, LP_WAIT_PRE2,
    LP_ADDR_HI,   LP_ADDR_LO,
    LP_LEN,       LP_CMD,
    LP_PAYLOAD,   LP_XOR,
    LP_POST1,     LP_POST2,
};
static LoraParseState g_st = LP_WAIT_PRE1;
static uint8_t  g_payloadLen   = 0;     // bytes to read after CMD
static uint8_t  g_payloadIdx   = 0;
static uint8_t  g_payloadBuf[256] = {0};
static uint8_t  g_xorAccum     = 0;
static uint8_t  g_lastCmd      = 0;
static uint32_t g_framesReceived = 0;
static uint32_t g_framesRejected = 0;
static uint32_t g_bytesForwarded = 0;
static uint32_t g_lastValidMs    = 0;

#define LORA_ACTIVE_WINDOW_MS 10000

bool walkerLoraSetup(const WalkerLoraConfig& cfg) {
    g_currentCfg = cfg;
    g_moduleReady = ebyteWriteConfig(cfg);
    if (g_moduleReady) {
        loraLogf("config OK: addr=%u ch=%u (%.3f MHz)\n",
                 (unsigned) cfg.addr, (unsigned) cfg.channel,
                 850.125 + cfg.channel);
        // Drop into transparent data mode.
        digitalWrite(LORA_M0_PIN, LOW);
        digitalWrite(LORA_M1_PIN, LOW);
        delay(50);
    } else {
        loraLogf("config FAILED — module wiring or band mismatch?\n");
    }
    return g_moduleReady;
}

void walkerLoraPump() {
    if (!g_moduleReady) return;

    while (loraSerial.available()) {
        uint8_t b = (uint8_t) loraSerial.read();
        switch (g_st) {
            case LP_WAIT_PRE1:
                if (b == 0x02) g_st = LP_WAIT_PRE2;
                break;
            case LP_WAIT_PRE2:
                g_st = (b == 0x02) ? LP_ADDR_HI : LP_WAIT_PRE1;
                break;
            case LP_ADDR_HI:
                g_st = LP_ADDR_LO;
                break;
            case LP_ADDR_LO:
                g_st = LP_LEN;
                break;
            case LP_LEN:
                // len_byte includes the CMD byte. So total payload size = b.
                if (b == 0 || b > sizeof(g_payloadBuf)) {
                    g_framesRejected++;
                    g_st = LP_WAIT_PRE1;
                    break;
                }
                g_payloadLen = b - 1;   // bytes after CMD
                g_payloadIdx = 0;
                g_xorAccum   = 0;
                g_st = LP_CMD;
                break;
            case LP_CMD:
                g_lastCmd  = b;
                g_xorAccum = b;
                g_st = (g_payloadLen == 0) ? LP_XOR : LP_PAYLOAD;
                break;
            case LP_PAYLOAD:
                g_payloadBuf[g_payloadIdx++] = b;
                g_xorAccum ^= b;
                if (g_payloadIdx >= g_payloadLen) g_st = LP_XOR;
                break;
            case LP_XOR:
                if (b != g_xorAccum) {
                    g_framesRejected++;
                    g_st = LP_WAIT_PRE1;
                    break;
                }
                g_st = LP_POST1;
                break;
            case LP_POST1:
                g_st = (b == 0x03) ? LP_POST2 : LP_WAIT_PRE1;
                if (g_st == LP_WAIT_PRE1) g_framesRejected++;
                break;
            case LP_POST2:
                if (b == 0x03) {
                    // Valid frame! Forward 0x31 payloads to LC29HDA; count
                    // any other valid cmd as "we're hearing the charger".
                    g_framesReceived++;
                    g_lastValidMs = millis();
                    if (g_lastCmd == 0x31 && g_payloadLen > 0) {
                        gnssSerial.write(g_payloadBuf, g_payloadLen);
                        g_bytesForwarded += g_payloadLen;
                    }
                } else {
                    g_framesRejected++;
                }
                g_st = LP_WAIT_PRE1;
                break;
        }
    }
}

bool walkerLoraActive() {
    if (g_lastValidMs == 0) return false;
    return (millis() - g_lastValidMs) < LORA_ACTIVE_WINDOW_MS;
}

bool walkerLoraReconfigure(const WalkerLoraConfig& cfg) {
    return walkerLoraSetup(cfg);
}

void walkerLoraGetStats(WalkerLoraStats& out) {
    out.moduleReady    = g_moduleReady;
    out.active         = walkerLoraActive();
    out.framesReceived = g_framesReceived;
    out.framesRejected = g_framesRejected;
    out.bytesForwarded = g_bytesForwarded;
    out.lastFrameMsAgo = g_lastValidMs ? (millis() - g_lastValidMs) : UINT32_MAX;
}

#endif  // LORA_PRESENT
