// walker_lora.cpp — EBYTE E22-900T22S configuration sequence + (Task 3)
// frame parsing. We're a passive listener; never transmit user data.
#include "walker_lora.h"
#include "walker_api.h"
#include "rtcm_log.h"

#ifdef LORA_PRESENT

extern HardwareSerial gnssSerial;
extern HardwareSerial loraSerial;

#define LORA_CONFIG_BAUD 9600
#define LORA_DATA_BAUD   115200

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

static uint8_t sanitizePacketLenCode(uint8_t code) {
    return (code <= 3) ? code : 1;
}

static uint8_t sanitizeAirRateCode(uint8_t code) {
    return (code <= 7) ? code : 2;
}

static uint16_t packetLenBytes(uint8_t code) {
    switch (sanitizePacketLenCode(code)) {
        case 0: return 240;
        case 1: return 128;
        case 2: return 64;
        case 3: return 32;
    }
    return 128;
}

static float airRateKbps(uint8_t code) {
    switch (sanitizeAirRateCode(code)) {
        case 3: return 4.8f;
        case 4: return 9.6f;
        case 5: return 19.2f;
        case 6: return 38.4f;
        case 7: return 62.5f;
        case 0:
        case 1:
        case 2:
        default:
            return 2.4f;
    }
}

// Build + send the 12-byte EBYTE permanent-save command. Returns true
// if the module echoed back a `0xC1` ACK with matching ADDH/ADDL/CHAN.
//
// Stock charger firmware writes the E220-style 8-byte payload:
//   ADDH ADDL e7 20 CH 83 00 00
// For our E22 we insert NETID=0 before REG0 and keep the same PHY profile:
// - REG0 = UART 115200 8N1 + configurable air rate (stock air code 7)
// - REG1 = configurable packet length + environmental RSSI + 22 dBm
// - REG3 = packet RSSI enabled, transparent mode, no relay/LBT
//
// NETID = 0 is mandatory for E22<->E220 interoperability because the E220
// family has no NETID filter.
//
// Per EBYTE E22-900T22S datasheet section 5.3 "Register Definition".
// Send 0xC0 = permanent save (NVS), 0xC2 = until power-cycle.
static bool ebyteWriteConfig(const WalkerLoraConfig& cfg) {
    uint8_t addH = (cfg.addr >> 8) & 0xFF;
    uint8_t addL = cfg.addr & 0xFF;
    uint8_t airCode = sanitizeAirRateCode(cfg.airRateCode);
    uint8_t packetCode = sanitizePacketLenCode(cfg.packetLenCode);
    uint8_t reg0 = 0xE0 | airCode;              // UART 115200 8N1 + air-rate bits
    uint8_t reg1 = (uint8_t) ((packetCode << 6) | 0x20); // subpacket + env RSSI + 22 dBm
    uint8_t pkt[] = {
        0xC0,        // permanent save
        0x00,        // start register
        0x09,        // 9 bytes of register data follow
        addH, addL,  // ADDH, ADDL
        0x00,        // NETID
        reg0,        // REG0: UART 115200 8N1, configurable air rate
        reg1,        // REG1: configurable subpacket, env RSSI, +22 dBm
        cfg.channel, // REG2: channel (= freq - base_freq, 1 MHz step)
        0x83,        // REG3: packet RSSI, transparent mode, WOR cycle 2000 ms
        0x00,        // CRYPT_H (no encryption)
        0x00,        // CRYPT_L (no encryption)
    };
    // (Re)claim the mode pins + UART2. A prior failed probe releases
    // them (pins → INPUT, UART2 → end()), so a later reconfigure after
    // the user wires the module must re-establish everything here.
    // loraSerial.begin() is safe to call repeatedly — the ESP32
    // HardwareSerial re-inits cleanly.
    pinMode(LORA_M0_PIN, OUTPUT);
    pinMode(LORA_M1_PIN, OUTPUT);
    // Per the E22 manual, configuration mode is always 9600 8N1 even when
    // the transparent/data UART is configured for 115200.
    loraSerial.begin(LORA_CONFIG_BAUD, SERIAL_8N1, LORA_RX_PIN, LORA_TX_PIN);

    // Enter configuration mode. Per E22-T datasheet section 5.1 the four
    // modes are selected by M1,M0:
    //   Mode 0 transparent = 0,0   Mode 1 WOR        = 0,1
    //   Mode 2 CONFIG      = 1,0   Mode 3 deep sleep = 1,1
    // Registers are only writable (0xC0 accepted) in Mode 2 = M1 HIGH, M0
    // LOW. Driving both HIGH lands in Mode 3 (deep sleep) where the module
    // ignores 0xC0 and returns nothing — the "short echo (0 bytes)" bug.
    digitalWrite(LORA_M0_PIN, LOW);
    digitalWrite(LORA_M1_PIN, HIGH);
    // Pump GNSS UART during the 50 ms settle so we don't drop NMEA bytes.
    walkerPumpGnss();
    delay(25);
    walkerPumpGnss();
    delay(25);
    walkerPumpGnss();

    // Flush any stale RX bytes before sending.
    while (loraSerial.available()) loraSerial.read();
    loraSerial.write(pkt, sizeof(pkt));
    loraSerial.flush();
    walkerPumpGnss();  // drain anything that built up during the UART write

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
              (resp[6] == reg0) && (resp[7] == reg1) &&
              (resp[8] == cfg.channel);
    if (!ok) {
        loraLogf("config: bad echo "
                 "%02x %02x %02x  addr=%02x%02x reg0=%02x reg1=%02x ch=%02x\n",
                 resp[0], resp[1], resp[2], resp[3], resp[4],
                 resp[6], resp[7], resp[8]);
    }
    return ok;
}

static bool g_moduleReady = false;
static WalkerLoraConfig g_currentCfg = {718, 17, 20, 14, 0, 7};

// Frame parser state. Resets to WAIT_PRE1 on any malformed byte.
// Charger RTK relay frames are:
//   [0x02 0x02][addr_hi addr_lo][len][cmd][payload...][xor][0x03 0x03][RSSI]
// where len = cmd + payload + xor byte count. The E22 appends the final
// RSSI byte because REG3 bit7 mirrors the charger config. Older captures
// looked like the XOR byte was omitted; LP_XOR keeps a fallback for that,
// but the primary path must NOT forward XOR into the RTCM stream or every
// RTCM3 CRC becomes invalid.
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
static uint32_t g_rawBytesIn     = 0;
static volatile bool g_forwardingEnabled = true;

enum RtcmParseState : uint8_t {
    RTCM_WAIT_PREAMBLE,
    RTCM_HEADER_1,
    RTCM_HEADER_2,
    RTCM_BODY,
};
static RtcmParseState g_rtcmState = RTCM_WAIT_PREAMBLE;
static uint8_t  g_rtcmBuf[1030] = {0}; // 0xD3 + 2-byte len + 1023 payload + 3-byte CRC
static uint16_t g_rtcmIdx = 0;
static uint16_t g_rtcmExpectedLen = 0;

static void rtcmResetParser() {
    g_rtcmState = RTCM_WAIT_PREAMBLE;
    g_rtcmIdx = 0;
    g_rtcmExpectedLen = 0;
}

static uint32_t rtcmCrc24q(const uint8_t* data, size_t len) {
    uint32_t crc = 0;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint32_t)data[i] << 16;
        for (uint8_t bit = 0; bit < 8; bit++) {
            crc <<= 1;
            if (crc & 0x1000000UL) crc ^= 0x1864CFBUL;
        }
    }
    return crc & 0xFFFFFFUL;
}

static void forwardRtcmStreamBytes(const uint8_t* data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        uint8_t b = data[i];
        switch (g_rtcmState) {
            case RTCM_WAIT_PREAMBLE:
                if (b == 0xD3) {
                    g_rtcmBuf[0] = b;
                    g_rtcmIdx = 1;
                    g_rtcmState = RTCM_HEADER_1;
                }
                break;
            case RTCM_HEADER_1:
                if ((b & 0xFC) != 0) {
                    // False preamble inside NMEA/binary noise. If this byte is
                    // another preamble, keep it as the start of a new candidate.
                    if (b == 0xD3) {
                        g_rtcmBuf[0] = b;
                        g_rtcmIdx = 1;
                    } else {
                        rtcmResetParser();
                    }
                    break;
                }
                g_rtcmBuf[g_rtcmIdx++] = b;
                g_rtcmState = RTCM_HEADER_2;
                break;
            case RTCM_HEADER_2: {
                g_rtcmBuf[g_rtcmIdx++] = b;
                uint16_t payloadLen = (uint16_t)(((g_rtcmBuf[1] & 0x03) << 8) | g_rtcmBuf[2]);
                g_rtcmExpectedLen = (uint16_t)(payloadLen + 6);
                if (payloadLen == 0 || g_rtcmExpectedLen > sizeof(g_rtcmBuf)) {
                    rtcmResetParser();
                } else {
                    g_rtcmState = RTCM_BODY;
                }
                break;
            }
            case RTCM_BODY:
                g_rtcmBuf[g_rtcmIdx++] = b;
                if (g_rtcmIdx >= g_rtcmExpectedLen) {
                    uint32_t want = ((uint32_t)g_rtcmBuf[g_rtcmExpectedLen - 3] << 16) |
                                    ((uint32_t)g_rtcmBuf[g_rtcmExpectedLen - 2] << 8) |
                                    (uint32_t)g_rtcmBuf[g_rtcmExpectedLen - 1];
                    uint32_t got = rtcmCrc24q(g_rtcmBuf, g_rtcmExpectedLen - 3);
                    if (want == got) {
                        gnssSerial.write(g_rtcmBuf, g_rtcmExpectedLen);
                        rtcmLogAppend(g_rtcmBuf, g_rtcmExpectedLen, RTCM_SRC_LORA);
                        g_bytesForwarded += g_rtcmExpectedLen;
                    }
                    rtcmResetParser();
                }
                break;
        }
    }
}

// Ring of the most recent raw UART2 bytes (pre-framing) for the serial
// diagnostic dump. 32 bytes is enough to eyeball a frame header / noise.
static uint8_t  g_rawTail[32]    = {0};
static uint8_t  g_rawTailPos     = 0;   // next write index
static uint8_t  g_rawTailLen     = 0;   // valid bytes (<= sizeof(g_rawTail))

#define LORA_ACTIVE_WINDOW_MS 10000

bool walkerLoraSetup(const WalkerLoraConfig& cfg) {
    g_currentCfg = cfg;
    g_moduleReady = ebyteWriteConfig(cfg);
    if (g_moduleReady) {
        loraLogf("config OK: addr=%u ch=%u (%.3f MHz) packet=%uB air=%.1fkbps netid=0\n",
                 (unsigned) cfg.addr, (unsigned) cfg.channel,
                 850.125 + cfg.channel,
                 (unsigned) packetLenBytes(cfg.packetLenCode),
                 (double) airRateKbps(cfg.airRateCode));
        // Drop into transparent data mode.
        digitalWrite(LORA_M0_PIN, LOW);
        digitalWrite(LORA_M1_PIN, LOW);
        // Pump GNSS UART during the 50 ms settle so we don't drop NMEA bytes.
        walkerPumpGnss();
        delay(25);
        walkerPumpGnss();
        loraSerial.updateBaudRate(LORA_DATA_BAUD);
        while (loraSerial.available()) loraSerial.read();
        loraLogf("data UART set to %u baud\n", (unsigned) LORA_DATA_BAUD);
        delay(25);
        walkerPumpGnss();
    } else {
        loraLogf("config FAILED — no module? releasing LoRa pins\n");
        // No module ACK. Stop driving the mode pins (back to high-Z
        // input) and close UART2 so a walker WITHOUT the E22 wired
        // behaves exactly like the pre-LoRa firmware: no held GPIOs,
        // no open UART. The LoRa pins now live on the JC3248W535 P2
        // header (IO16/15/7/14, all free GPIOs), so they no longer
        // fight the SD MOSI (IO11) or U0RXD (IO44) nets that earlier
        // made the "RTK module not detected" overlay flap every ~5 s.
        pinMode(LORA_M0_PIN, INPUT);
        pinMode(LORA_M1_PIN, INPUT);
        loraSerial.end();
    }
    return g_moduleReady;
}

void walkerLoraPump() {
    if (!g_moduleReady) return;

    while (loraSerial.available()) {
        uint8_t b = (uint8_t) loraSerial.read();
        g_rawBytesIn++;
        g_rawTail[g_rawTailPos] = b;
        g_rawTailPos = (g_rawTailPos + 1) % sizeof(g_rawTail);
        if (g_rawTailLen < sizeof(g_rawTail)) g_rawTailLen++;
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
                // len_byte includes CMD + XOR. The bytes after CMD that
                // belong to the forwarded UM980 stream are therefore b - 2.
                if (b == 0 || b > sizeof(g_payloadBuf)) {
                    g_framesRejected++;
                    g_st = LP_WAIT_PRE1;
                    break;
                }
                g_payloadLen = (b >= 2) ? (uint8_t)(b - 2) : 0;
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
                if (b == g_xorAccum) {
                    g_st = LP_POST1;
                    break;
                }
                if (b == 0x03) {
                    // Compatibility fallback for old captures where RTK
                    // frames appeared to omit XOR; this byte is already
                    // the first trailer byte.
                    g_st = LP_POST2;
                    break;
                }
                // Compatibility fallback for a no-XOR frame whose len byte
                // counted one more payload byte. Treat this byte as the
                // final payload byte, then require the normal trailer.
                if (g_payloadIdx < sizeof(g_payloadBuf)) {
                    g_payloadBuf[g_payloadIdx++] = b;
                    g_st = LP_POST1;
                    break;
                } else {
                    g_framesRejected++;
                    g_st = LP_WAIT_PRE1;
                    break;
                }
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
                    if (g_lastCmd == 0x31 && g_payloadIdx > 0 && g_forwardingEnabled) {
                        forwardRtcmStreamBytes(g_payloadBuf, g_payloadIdx);
                    }
                } else {
                    g_framesRejected++;
                }
                g_st = LP_WAIT_PRE1;
                break;
        }
    }
}

void walkerLoraSetForwardingEnabled(bool enabled) {
    if (g_forwardingEnabled != enabled) rtcmResetParser();
    g_forwardingEnabled = enabled;
}

bool walkerLoraForwardingEnabled() {
    return g_forwardingEnabled;
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
    out.rawBytesIn     = g_rawBytesIn;
    out.lastFrameMsAgo = g_lastValidMs ? (millis() - g_lastValidMs) : UINT32_MAX;
}

size_t walkerLoraGetRawTailHex(char* out, size_t outCap) {
    if (!out || outCap == 0) return 0;
    out[0] = '\0';
    if (g_rawTailLen == 0) return 0;
    static const char* hex = "0123456789abcdef";
    // Oldest byte first: start = pos - len (mod size).
    uint8_t start = (uint8_t) ((g_rawTailPos + sizeof(g_rawTail) - g_rawTailLen)
                               % sizeof(g_rawTail));
    size_t written = 0;
    for (uint8_t i = 0; i < g_rawTailLen; i++) {
        if (written + 2 >= outCap) break;   // leave room for NUL
        uint8_t b = g_rawTail[(start + i) % sizeof(g_rawTail)];
        out[written++] = hex[(b >> 4) & 0x0f];
        out[written++] = hex[b & 0x0f];
    }
    out[written] = '\0';
    return written;
}

#endif  // LORA_PRESENT
