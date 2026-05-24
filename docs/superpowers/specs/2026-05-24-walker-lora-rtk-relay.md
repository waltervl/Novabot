# Walker LoRa RTK Relay — Hybrid RTCM Source

**Status:** Design approved 2026-05-24, awaiting implementation plan.

## Goal

The walker can already do RTK mapping when connected via WiFi to an internet NTRIP caster (Centipede), but that requires WiFi + internet wherever you walk. The Novabot charger already broadcasts RTCM corrections over LoRa to the mower for cm-grade navigation. By adding a passive LoRa receiver to the walker, we can snoop that same broadcast and get RTK FIX with zero internet dependency, anywhere within LoRa range of the charger.

The setup also keeps NTRIP as a fallback so the walker still works on a holiday plot or anywhere outside LoRa range, as long as a WiFi network + NTRIP caster are available.

## Architecture

Single-threaded main loop, two RTCM sources, recency-based arbitration:

```
LC29HDA RX ← gnssSerial.write() ← arbitrated by:
  · loraPump() — pushes bytes whenever a valid 0x31 frame arrives
  · ntripPump() — pushes bytes only when walkerLoraActive() == false
```

`walkerLoraActive() := (millis() - lastValidLoraFrameMs) < 10_000`. While LoRa is "active", NTRIP holds its TCP socket open but drops its RTCM bytes. The instant LoRa goes silent for >10 s, NTRIP takes over without re-establishing the socket.

This keeps both code paths additive: a walker with no LoRa hardware behaves exactly like today. A walker with LoRa hardware but no NTRIP config receives only LoRa. A fully configured walker gets the better of the two automatically.

## Wire format (from Ghidra decomp + working setup)

Charger broadcasts:

```
[0x02 0x02][0x00 0x03][len+1][0x31][RAW UM980 bytes (RTCM3 + NMEA mixed)][XOR][0x03 0x03]
                ^^^^
                charger addr (0x0003)
```

- `0x31` = RTK_RELAY command byte. Other command bytes (0x30, 0x32-0x36) carry charger/mower control traffic; we ignore those frames.
- RAW payload is whatever the charger's UM980 base-mode GNSS chip emits on its UART: RTCM3 correction messages (recognisable by 0xD3 preamble) interleaved with NMEA sentences (GxGGA, etc.). We forward all of it verbatim to the LC29HDA; the LC29HDA's RTCM parser picks out what it needs and ignores the NMEA noise.
- XOR is computed over the payload bytes only (the cmd byte through the last data byte, not including framing).

The Novabot charger is a pure broadcaster — it does not know or care how many receivers are listening. Adding the walker as a second listener does not affect the mower.

## Hardware

### Module
EBYTE **E22-900T22S** (SX1262, 22 dBm, EU 868 MHz ISM band). Bare SMD module with castellated edge pads. User has one already; charger verified to use the 868 MHz variant.

### Walker wiring
| Walker GPIO | E22 pin | Direction | Purpose |
|---|---|---|---|
| GPIO 42 | TXD | E22 → ESP32 | LoRa data in |
| GPIO 41 | RXD | ESP32 → E22 | Module config only |
| GPIO 44 | M0 | ESP32 → E22 | Mode bit 0 |
| GPIO 11 | M1 | ESP32 → E22 | Mode bit 1 |
| 3.3 V | VCC | — | Power |
| GND | GND | — | Power |

AUX pin not wired. We only read, never transmit user data.

### Antenna
External UFL → SMA → quarter-wave whip dipole (~82 mm at 868 MHz). PCB antenna is too short for reliable garden range; external is mandatory for any usable distance.

### E22 module configuration
On every boot:
1. M0=1, M1=1 (config mode)
2. Send 9-byte command `[0xC0 0x00 0x09 ADDH ADDL CHAN OPT_S OPT_F OPT_T OPT_R OPT_C]`:
   - `ADDH, ADDL` = 0x02, 0xCE (= 718, the default pair)
   - `CHAN` = 17
   - Other bytes set transparent mode + air rate matched to the charger's setting
3. Verify ACK echo
4. M0=0, M1=0 (transparent/data mode)
5. Module is now silently relaying anything it receives on the air to its UART TXD.

The module remembers config across power cycles in its own EEPROM, but we re-write every boot so a previously-misconfigured module recovers without manual intervention.

### LoRa pair defaults
Match the user's verified working setup (charger LFIC1231000319 + mower LFIN1231000211):
- addr = **718**
- channel = **17** (≈ 867.125 MHz)
- hc (scan upper bound) = **20**
- lc (scan lower bound) = **14**

Configurable via UI; these defaults cover the most common case (one charger, default Novabot factory pair).

## Software

### New module `tools/rtk-walker/src/walker_lora.{h,cpp}`

Public API:
```c
void walkerLoraSetup();        // called from setup() after WiFi associates
void walkerLoraPump();         // called from main loop, every iteration
bool walkerLoraActive();       // true if a valid 0x31 frame in last 10 s
void walkerLoraReconfigure();  // re-sends EBYTE config bytes (after settings change)

struct WalkerLoraStats {
    bool     moduleReady;
    bool     active;
    uint32_t framesReceived;
    uint32_t framesRejected;     // XOR fail / unknown cmd
    uint32_t bytesForwarded;
    uint32_t lastFrameMsAgo;
};
void walkerLoraGetStats(WalkerLoraStats& out);
```

Internal:
- `UART2` driver at 9600 baud (EBYTE default), no flow control
- Byte-level state machine: `SEARCH_PREAMBLE → ADDR_HI → ADDR_LO → LEN → CMD → PAYLOAD[N] → XOR → POSTAMBLE_1 → POSTAMBLE_2`
- Reset to `SEARCH_PREAMBLE` on any malformed byte; counts the bad frame
- On valid 0x31 frame: `gnssSerial.write(payload, n)` + counter updates
- Other cmd bytes (0x30, 0x32-0x36) are valid frames we silently skip
- `lastValidLoraFrameMs` updated on any cmd, so a heartbeat-only stream still keeps `loraActive == true`

### Changes to `main.cpp`
- `#include "walker_lora.h"`
- Call `walkerLoraSetup()` after WiFi config (before the main loop)
- Add `walkerLoraPump()` to the main loop, between `ntripPump()` and the second `gnssPump()`
- In `ntripPump()`'s RTCM-forwarding block: guard the `gnssSerial.write()` call with `if (!walkerLoraActive())`
- Snapshot extension (see below)

### Changes to `walker_api.h`
```c
struct WalkerSnapshot {
    ...
    bool     loraActive;
    bool     loraModuleReady;
    uint32_t loraBytesForwarded;
    uint32_t loraFramesReceived;
};

struct WalkerConfigView {
    ...
    uint16_t loraAddr;
    uint8_t  loraChannel;
    uint8_t  loraHc;
    uint8_t  loraLc;
};
```

### NVS persistence
Four new keys (within Preferences' 15-char limit):
- `lora_addr` (uint16, default 718)
- `lora_ch` (uint8, default 17)
- `lora_hc` (uint8, default 20)
- `lora_lc` (uint8, default 14)

Loaded in `loadConfig()`, saved in `saveConfig()`.

### Memory budget
| Item | Size |
|---|---|
| State machine state | ~32 B |
| Payload accumulator buffer | 256 B (max E22 frame) |
| Stats | ~32 B |
| Strings / config | ~32 B |
| Total | ~360 B |

Comfortably under 75 % RAM (currently 73.3 %).

## UI

### TFT — new Settings sub-tab "LoRa"
Same tabview pattern as WiFi/NTRIP. Four numeric textareas (soft keyboard) + Save button:

| Field | Default | Range |
|---|---|---|
| Address | 718 | 1 – 65535 |
| Channel | 17 | lc..hc |
| HC (scan upper) | 20 | 0 – 83 |
| LC (scan lower) | 14 | 0 – 83 |

Save writes NVS + immediately re-runs `walkerLoraReconfigure()` (no reboot).

### TFT topbar — LoRa indicator
New small icon between WiFi and battery: `📡` symbol (or `LV_SYMBOL_BARS` as glyph fallback). Color coding:
- Emerald: `loraActive == true` (frames in last 10 s)
- Amber: `loraModuleReady == true && loraActive == false` (module up but charger silent / out of range)
- Dim: module not initialised or init failed

NTRIP indicator stays where it is and reflects only NTRIP socket state, independent of source arbitration. User can read at a glance: both colored = both alive (LoRa wins), only NTRIP colored = NTRIP serving, neither = no RTCM source.

### Web UI — new section + status
- New collapsible card "LoRa" with the same four fields + Save (POSTs `/api/config/lora`)
- Status card extended: under "Fix" row, show "RTK source: LoRa" / "RTK source: NTRIP" / "RTK source: none"
- Bytes/s counter per source so the user can verify data is flowing

### HTTP endpoints
- `GET /api/config/lora` → `{ "addr": 718, "channel": 17, "hc": 20, "lc": 14 }`
- `POST /api/config/lora` (auth) → save + reconfigure module
- `GET /api/status` extended with:
  ```json
  "lora": { "active": true, "moduleReady": true, "frames": 142, "bytes": 28144 }
  ```

## Testing

1. **Bench bring-up:** wire E22 to a USB-UART adapter on the laptop. Configure addr 718 / ch 17 via screen + 0xC0 command. Read bytes for 60 s while the mower's setup runs. Confirm 0x31 frames arrive with valid XOR. Verify payload starts with 0xD3 (RTCM3 preamble) periodically.
2. **Walker integration:** solder E22 to walker, flash firmware. Confirm `[lora] module ready` in serial log, then `[lora] first 0x31 frame received` once charger is in range.
3. **End-to-end RTK FIX:** outside in the garden, charger powered, walker connected via USB. Within ~30 s of `loraActive == true`, LC29HDA should report fix=4 (RTK FIX).
4. **Hybrid switchover:** with WiFi + NTRIP also configured, power-cycle the charger mid-walk. After ~10 s, NTRIP should take over silently. fix=4 should hold (might briefly visit fix=5 FLOAT during switchover).
5. **Range:** walk progressively further from charger. Log RSSI + bytes/s. Document the practical garden range (~50-200 m expected at NL house density).
6. **Pair-config UI:** change channel in TFT Settings, save, watch `walkerLoraReconfigure` get called and `[lora] reconfig OK` in serial. Without reboot.

## Out of scope (for this spec)

- **LoRa TX from walker.** Purely a passive listener.
- **Walker-driven pairing handshake.** Static config matched to charger.
- **AES encryption.** Stock RTCM frames are plaintext per the working setup memory; no key to extract.
- **Multi-charger / multi-pair support.** One config per walker. Switching means typing new values into Settings.
- **Range extender / repeater modes.** E22 has those but they're not in scope here.
- **Live RSSI display on TFT topbar.** Stats counter is enough; precise RSSI is a "later, if requested" feature.

## Risks and open questions

- **Air-rate match.** EBYTE modules have a configurable air rate (1.2k - 62.5k bps). The charger uses some setting we don't know. We'll need to dump our own LoRa pair config or experiment to find it. Wrong air rate = silent receiver. **Mitigation:** start with EBYTE default (2.4 kbps), bench-test, iterate.
- **Strap pin conflicts.** GPIO 11 (M1) — verify this isn't pulled at boot by something else on the JC3248W535 PCB. If conflict, swap to another free GPIO.
- **PSRAM / OPI conflict.** GPIO 33-37 are reserved by octal PSRAM. None of our picks use those, but verify before final layout.
- **Frame size.** E22 max single-transmission payload is 240 bytes (configurable up to 256). Our parser must handle frames split across UART reads — state machine already does this byte-by-byte.
