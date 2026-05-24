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
    // Frame parser is added in Task 3. For now just drain whatever the
    // module spits out so the UART RX FIFO doesn't fill. No logging
    // here — bench testers can re-enable a per-byte print if needed,
    // but the production log stays clean.
    while (loraSerial.available()) {
        (void) loraSerial.read();
    }
}

bool walkerLoraActive() { return false; }  // wired up in Task 3

bool walkerLoraReconfigure(const WalkerLoraConfig& cfg) {
    return walkerLoraSetup(cfg);
}

void walkerLoraGetStats(WalkerLoraStats& out) {
    out.moduleReady     = g_moduleReady;
    out.active          = false;
    out.framesReceived  = 0;
    out.framesRejected  = 0;
    out.bytesForwarded  = 0;
    out.lastFrameMsAgo  = UINT32_MAX;
}

#endif  // LORA_PRESENT
