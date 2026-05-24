# LC29HDA 5Hz RTK Analysis

> Investigation triggered by RTK walker (ESP32-S3 + Quectel LC29HDA + NTRIP `caster.centipede.fr`)
> never reaching RTK FIX above 1 Hz. Author: research run on 2026-05-22.

---

## TL;DR

**You are not going to get RTK FIX at 5 Hz on an LC29HDA, no matter how clean the RTCM,
the sky view, or the firmware build. The DA variant is hardware/firmware-locked to a
**1 Hz RTK position rate** — Quectel's own datasheet, application note and product page
all state this explicitly. The `PAIR050,500` command (2 Hz) is silently accepted by
the NMEA parser, but the RTK engine inside the DA still runs at 1 Hz; the higher
output rate is GGA echoes interpolated by the GNSS PVT engine, *not* RTK solutions,
so the receiver falls out of FIX and only reports FLOAT once you push the position
rate past 1 Hz.

The secondary problem on top of that is a **frequency-band mismatch**: the LC29HDA is
an **L1 + L5** module, but every Centipede ZED-F9P base (incl. `BAAL`, the closest one
to NL) outputs corrections on **L1 + L2** carrier phase (sourcetable `carrier=2`).
That makes RTK FIX slow / brittle even at 1 Hz — only the GPS L1 carrier is shared,
so the dual-band ambiguity-resolution advantage is lost and the receiver behaves
like a single-frequency L1 RTK rover.

**Recommended fix (in order of likely payoff):**
1. **Keep `PAIR050,1000` (1 Hz)** as the actual fix rate. Add high-density sampling
   *between* fixes by lowering the spatial displacement filter (e.g. drop a point
   every 5 cm of motion) and/or move slower. This breaks the perceived "low rate =
   sparse polygon" tradeoff at the source.
2. **Swap the LC29HDA for an LC29HEA** if you want true 5 Hz RTK FIX. It is the same
   pinout / footprint and supports RTK up to 10 Hz natively (rtklibexplorer demoed
   5 Hz FIX with Centipede corrections in 2024).
3. **Move to an L1+L5-capable base** (e.g. a private LC29HBS base on your own roof,
   or a Septentrio Mosaic-X5 Centipede peer outputting MSM7 with L5). Or accept
   that the LC29HDA is doing the best it can on L1 only.

---

## Datasheet specs

### Position / RTK update rate (LC29H Hardware Design v1.2, page 14-15)

Quectel's official `LC29H_Series_Hardware_Design` PDF lists the supported "Update
Rate" per variant. Quoting the column for each:

| Variant | PVT update rate (max) | RTK update rate |
|---|---|---|
| LC29H (AA) | PVT 1 Hz / 10 Hz | — (no RTK) |
| LC29H (BA) | PVT 1 Hz / 10 Hz, GNSS raw 1 Hz, IMU 100 Hz | RTK + DR — see app note |
| LC29H (CA) | PVT 1 Hz / 10 Hz, GNSS raw 1 Hz, IMU 100 Hz | — (DR only, no RTK) |
| **LC29H (DA)** | **PVT: 1 Hz (RTK), GNSS raw 1 Hz** | **1 Hz max** |
| LC29H (EA)\* | PVT 1–10 Hz, GNSS raw 1 Hz | 1–10 Hz |
| LC29H (BS) | — | base station only |

Citation: [`LC29HDAMD Datasheet.pdf` (Mikroe mirror)](https://download.mikroe.com/documents/datasheets/LC29HDAMD%20Datasheet.pdf)
(table at page 14, "Update Rate" row; verified via `pdftotext` extraction).

### Application note repeats it (twice, two doc versions)

From `Quectel_LC29H(BA,CA,DA,EA)_DR&RTK_Application_Note` **v1.0** (introduction):

> "LC29H (DA) only supports RTK (update rate: 1 Hz)."
> "LC29H (EA) only supports RTK (max. update rate: 10 Hz, 10 Hz by default)."

Citation: [forum-hosted v1.0 PDF](https://forums.quectel.com/uploads/short-url/sHocosk8FFCzLmszNndUJXUJfCS.pdf)
(line 456–457 of `pdftotext` output).

From the same document **v1.2.0** (the current revision):

> "LC29H (DA) only supports RTK (Max update rate: 1 Hz)."
> "LC29H (EA) only supports RTK (Max update rate: 10 Hz, 10 Hz by default)."

Citation: [forum-hosted v1.2.0 PDF](https://forums.quectel.com/uploads/short-url/ncdKSn5cRYyDbOpfYmvGGs1vEIA.pdf)
(line 356–357 of `pdftotext` output).

### Quectel product page

The official Quectel GNSS LC29H product page lists, per variant:

- **LC29H (DA)** — "High precision GNSS with **1Hz RTK function**" (L1+L5 dual band).
- **LC29H (EA)** — "High precision GNSS with **10Hz RTK** and dual antenna heading functions" (L1+L5 dual band).

Citation: [Quectel — GNSS LC29H Series](https://www.quectel.com/product/gnss-lc29h/).

### Frequency bands

All RTK-capable LC29H variants (BA / DA / EA) are advertised as **L1 + L5**
dual-band — not L1 + L2. Concretely:

- GPS L1 C/A + L5
- GLONASS L1
- Galileo E1 + E5a
- BeiDou B1I + B2a
- QZSS L1 + L5

Citation: same hardware-design table, "GNSS Constellations and Frequency Bands" column;
also confirmed in plain text on the Quectel product page entry.

---

## PAIR command reference relevant to our problem

Pulled directly from `Quectel_LC29H_Series&LC79H(AL)_GNSS_Protocol_Specification`
v1.4 ([Quectel-hosted PDF](https://www.quectel.com/content/uploads/2022/02/Quectel_LC29H_SeriesLC79HAL_GNSS_Protocol_Specification_V1.4.pdf)),
extracted via `pdftotext` (see `/tmp/lc29h_proto.txt`).

| Cmd | What it does | Send to LC29HDA? |
|---|---|---|
| **`PAIR050,<ms>`** | Set position fix interval. Range 100–1000 ms. Default 1000. ACK: `$PAIR001,050,0`. **Note:** the parser accepts the value across the full 100–1000 range *for every variant* — the DA's RTK engine simply can't keep up below 1000 ms. The fix rate above 1 Hz is purely a PVT-engine output, not an RTK output. | Set to **1000** (1 Hz). |
| `PAIR051` | Get position fix interval. | optional diagnostic |
| `PAIR062,<type>,<rate>` | Set NMEA message rate per type (0=GGA, 1=RMC, 2=VTG, 3=GSA, 4=GSV, 5=GLL). 0 disables. **Spec note:** "If the set frequency is greater than 1 Hz, only RMC and GGA messages will be output at the set frequency, whereas GSA and GSV messages are kept output at 1 Hz." | Use to silence GSA/GSV if NMEA bandwidth pressure ever shows up; not the root cause here. |
| `PAIR021` | Get firmware version (we already send this). Returns `PAIR020,<version>`. Useful for triage. | keep |
| `PAIR075` | Get AIC (active interference cancellation) status. Read-only diagnostic. | optional |
| `PAIR080,<mode>` | Set navigation mode (0=Normal, 1=Fitness, 2=Aviation, etc.). Affects filtering, not rate. | optional |
| `PAIR400,<mode>` | Set DGPS mode (0=Disable, 1=Auto-fallback, 2=RTK). **Default 2 is correct for an RTK rover.** | leave default |
| `PAIR410,<en>` | SBAS enable. Spec note: "LC29H (EA) does not support this command". Not needed when running RTK. | optional |
| **`PAIR432,<mode>`** | Set RTCM output mode (-1=disable / 0=MSM4 / 1=MSM7). **This is only relevant if the module is acting as a base** — for an LC29HDA rover this controls its own RTCM output, not what it accepts as input. The DA accepts MSM4/5/7 input either way. | not needed for rover |
| `PAIR433` | Get RTCM output mode. | optional |
| `PAIR511` / `PAIR513` | Save current navigation data / settings to NVM. NB: if fix rate is > 1 Hz, you must power-cycle the GNSS engine with `PAIR382,1` + `PAIR003` before save, and `PAIR002` to re-power. Not applicable to us at 1 Hz. | only after a PAIR050 / PAIR062 change you want to persist |
| **`PAIR864,0,0,<baud>`** | Set UART0 (the main host port) baud rate. Default 115200, range up to 921600. **Could raise to 460800 if NMEA bandwidth ever becomes the bottleneck**, but at 1–2 Hz it isn't. | not needed at current rate |

Two PAIR commands relevant to RTK conversion that we are **not** sending and probably
should (defensive idempotent re-asserts at boot):

- **`PAIR400,2`** — forces DGPS mode to "RTK". If something on the module ever flipped
  to mode 0 or 1 (the spec doesn't say it'll persist across firmware loads),
  re-asserting it costs one line and a 50 ms parse.
- **`PAIR062,3,0`** + **`PAIR062,4,0`** — turn off GSA/GSV when running at >1 Hz
  (only GGA/RMC are useful for the walker's purposes anyway). Spec note above says
  GSA/GSV stay capped at 1 Hz regardless, so they're pure bandwidth tax above 1 Hz.

There's also a parallel `PQTM*` command family used on newer firmware
(`PQTMCFGFIXRATE`, `PQTMSAVEPAR`, etc.). For LC29HDA, all evidence points to
PAIR050 being the canonical fix-rate path; PQTMCFGFIXRATE is documented for the EA
variant. We can keep using PAIR050.

---

## Multi-frequency RTK requirements

The conventional wisdom — confirmed by multiple Quectel forum threads and the
rtklibexplorer write-ups — is:

> "Your L1L2 RTK service is not applicable to LC29HDA, which is a L1L5 band RTK
> module. It's recommended to use L1L5 RTK service."
> — Quectel staff `Berton.Peng-Q` on the LC29HDA RTK Rover thread

Citation: [Quectel forum thread — "LC29HDA RTK Rover - Not RTK Fixed"](https://forums.quectel.com/t/lc29hda-rtk-rover-not-rtk-fixed/46060).

What this *technically* means: the LC29HDA's hardware can sample L1 + L5
carriers. To resolve integer ambiguities quickly (which is what gets you from
FLOAT to FIX), the rover needs **base-station carrier-phase observations on the
same frequency bands**. If the base sends L1 + L2 (which is what nearly every
ZED-F9P base does), then:

- The rover and base share **only the L1 carrier**.
- The L5 channels on the rover get no equivalent base observation and the engine
  falls back to single-frequency (L1-only) RTK behaviour.
- Single-frequency RTK can still reach FIX, but convergence is much slower
  (minutes, not seconds), it's far more sensitive to multipath, and it falls back
  to FLOAT readily under any movement or sky change.

That said, a second Quectel staffer (`george.gao`) on a separate thread
([float→fix thread](https://forums.quectel.com/t/float-rtk-mode-to-fixed-rtk-using-lc29hbs-and-lc29hda/37451))
confirmed an LC29HBS base + LC29HDA rover combo does reach FIX while moving when
both ends are L1 + L5 dual-band. So this is genuinely about pairing the receiver
to a same-band base.

**Verdict:** dual-band base/rover band-matching is not a hard requirement for
*any* RTK FIX — but it is *the* requirement for **fast, reliable FIX while
moving**, which is what the walker needs. At 1 Hz with our current setup the
walker can still FIX because the engine has 1000 ms to chew on each new RTCM,
and we are walking slowly enough that the rover stays in a coherent multipath
environment. Push to 2 Hz and that budget halves and the L1-only RTK loses lock.

---

## RTCM stream analysis

I fetched the live Centipede sourcetable from `caster.centipede.fr:2101` to see
exactly what each Dutch base is streaming. Saved at:
`/Users/rvbcrs/.claude/projects/.../tool-results/b4ts0vibm.txt`.

### NLDB mountpoint does NOT exist

There is **no mountpoint named `NLDB`** in the public Centipede sourcetable.
There are exactly two NLD-tagged mountpoints currently online:

```
STR;ANT1;NLD;RTCM3;1004,1005,1007,1012,1033,1230;3;GLO+GPS;NONE;NLD;51.580;4.289;0;0;NTRIP RTKBase Unicore_UM982 2.6.4 R4.10Build11826;none;N;N;15200;CentipedeRTK
STR;BAAL;NLD;RTCM3;1004,1005,1006,1008,1012,1019,1020,1033,1042,1046,1077,1087,1097,1127,1230;2;GLO+GAL+BDS+GPS;NONE;NLD;51.855;5.146;0;0;NTRIP RTKBase U-blox_ZED-F9P 2.6.3 1.13;none;N;N;15200;CentipedeRTK
```

The NTRIP sourcetable field semantics ([RTCM-NTRIP wiki](https://software.rtcm-ntrip.org/wiki/STR)):

- Column 6 = "Carrier" (NMEA + carrier phase advertisement)
  - 0 = No (DGPS only)
  - 1 = L1 only
  - **2 = L1 + L2**
  - **3 = L1 + L2 + L5** (triple-band)
- Column 5 = RTCM message-type list with optional interval

### `BAAL` (the closest one, in case the user typed "NLDB" for "Baal-NL")

- Receiver: **u-blox ZED-F9P**, which is **L1 + L2 only** by default.
- Carrier = **2** (L1 + L2 phase).
- Outputs: `1004` (GPS L1+L2 obs, legacy), `1005`/`1006` (ARP), `1012` (GLO L1+L2),
  `1019/1020/1042/1046` (ephemeris), `1077/1087/1097/1127` (GPS/GLO/GAL/BDS MSM7),
  `1230` (GLO biases). Update interval not specified per-message but RTKBase
  defaults are 1 s for obs, 5–10 s for ephemeris.

The MSM7 messages (1077/1087/1097/1127) are **the right format** for the LC29HDA
(it accepts MSM4/5/7 per the spec table). But the *content* of those MSM7
messages from a ZED-F9P is L1 + L2 signals — not L5. The LC29HDA can decode them
and use the L1 portion; the L2 portion is irrelevant to its L1+L5 hardware.

### `ANT1` (the other NLD base)

- Receiver: **Unicore UM982**, capable of L1+L2+L5.
- Carrier = **3** (advertised as triple-band!), BUT…
- Outputs only `1004,1005,1007,1012,1033,1230` — **all legacy non-MSM messages**.
  No MSM4/MSM5/MSM7 at all. `1004` is GPS L1+L2 only (no L5). So in practice
  ANT1's advertised L5 capability is *not* in the stream; only L1 carrier phase
  ever reaches the rover.

### Implication

**No Dutch Centipede base currently sends L5 / E5a / B2a observations.** The
LC29HDA is therefore operating as an effective single-frequency (L1) RTK rover
regardless of which NL Centipede mountpoint you pick. This is the *secondary*
reason FIX is brittle and FLOAT is the steady state above 1 Hz.

To get an L5-capable base in the Netherlands you'd need to:
- Find a base running a Septentrio Mosaic-X5 or Unicore UM980/982 *and* explicitly
  configured to output MSM7 (1077 / 1087 / 1097 / 1127) with all signals enabled,
  including L5 — e.g. mountpoint `56MOUS` in France (Mosaic-X5) does this, but it's
  >800 km from NL so the ionospheric model breaks down.
- Or host your own LC29HBS-based Centipede peer.
- Or use a paid commercial L5-aware network (e.g. Swift Skylark, NTRIP NEAR).

---

## NMEA / UART throughput analysis

This is **not** the bottleneck. Math:

- At 1 Hz: ~5 sentences (GGA, RMC, GSA × N, GSV × M) ≈ 400–700 B per epoch ≈ 0.5 KB/s.
- At 5 Hz (worst case if engine actually ran that fast): GGA + RMC only (per spec)
  ≈ 2 × 80 B × 5 = 800 B/s; GSA/GSV stay capped at 1 Hz so add another 300 B/s.
  Total ≈ 1.1 KB/s.
- 115200 baud = ~11.5 KB/s — **10× headroom**.
- ESP32-S3 default UART RX buffer = 256 B. At 5 Hz, max burst per epoch is ~200 B
  (a single GGA+RMC fired back-to-back). Fits.
- Walker's `gnssPump()` runs twice per `loop()` iter and TinyGPSPlus encodes
  byte-by-byte — drains in micro-seconds.

The fluctuating 1–4 Hz observed rate is **not** an ESP32-side buffer-overflow
artefact. The hypotheses for that observation are listed in the next section.

---

## Open source reference projects

### 1. rtklibexplorer — Quectel LC29HEA 5 Hz RTK FIX (2024)

> "Since the output rate is set to 5 Hz, this is about 8 seconds." (Author reports
> the quality indicator switches from Float RTK to Fixed RTK after ~41 samples,
> ~8 s at 5 Hz.)

PAIR sequence used:

```
$PAIR062,2,0*3C      // turn off GSA
$PAIR062,3,0*3D      // turn off GSV
$PAIR062,5,0*3B      // turn off VTG
$PAIR050,200*21      // 200 ms = 5 Hz
```

Module: **LC29HEA** (not DA). Firmware: `LC29HEANR11A03S_RSA` (2023-10-31) or newer.
Corrections: RTCM3 MSM7 @ 1 Hz from two physical bases via RTKLIB STRSVR.

Citation: [rtklibexplorer — "Configuring the Quectel LC29HEA receiver for real-time
RTK solutions"](https://rtklibexplorer.wordpress.com/2024/05/06/configuring-the-quectel-lc29hea-receiver-for-real-time-rtk-solutions/).

### 2. mrichar1/esp32-gps — ESP32 RTK controller, tested with LC29H(BS/DA/EA)

> "Tested with ESP32 S3 (ESP32-S3-WROOM-1-N16R8) and C3 Supermini devices and
> Quectel LC29H(BS/DA/EA) GPS modules."

The repo supports NTRIP client + Bluetooth output + Centipede as a default caster
(`NTRIP_CASTER = "crtk.net"` in defaults). No specific PAIR sequence visible from
the README excerpt; setup commands are user-supplied via `GPS_SETUP_COMMANDS`.

Citation: [mrichar1/esp32-gps](https://github.com/mrichar1/esp32-gps/) — README.

### 3. diy-robot-lawn-mower thread (LC29HEA field results, Feb 2025)

User `adamant` (German-language post) reports:

> "Bei 10 Hz ist er sehr instabil… bei 7 Hz ist er schon voll einsatzfähig… bei
> 5 Hz hat er sofort den RTK-Fix"
> (Translation: "At 10 Hz it's very unstable, at 7 Hz it's fully usable [RTK-Fix
> with occasional FLOAT drops while moving], at 5 Hz immediate RTK-Fix and
> stable.")

Module: **LC29HEA** with firmware updated from stock. Corrections: Centipede via
laptop USB.

Citation: [DIY Robot Lawn Mower forum, "LC29H(XX) GPS/RTK HAT" thread](https://www.diy-robot-lawn-mower.com/threads/lc29h-xx-gps-rtk-hat.127/).

### 4. GLAY-AK2/NTRIP-client-for-Arduino — bare-bones NTRIP client

ESP32 NTRIP client implementation, used as the basis for many LC29H projects. No
PAIR config; the LC29H is configured separately. Useful as a reference for the
HTTP handshake (which our walker firmware already implements correctly — the
`/ntrip` mountpoint flow plus the budget cap on RTCM forwarding is sound).

Citation: [GLAY-AK2/NTRIP-client-for-Arduino](https://github.com/GLAY-AK2/NTRIP-client-for-Arduino).

---

## Why our measured rate fluctuates 1–4 Hz when we set 2 Hz

The walker counts `gps.location.isUpdated()` ticks, which only fire when the
TinyGPS++ parser sees a fully-parsed GGA/RMC change in lat or lng. Several
plausible explanations, ranked by likelihood:

1. **The DA's RTK PVT engine isn't actually running at 2 Hz — only the position
   *output* parser is.** PAIR050 controls the GNSS PVT engine's output cadence,
   but the RTK engine on the DA is hard-locked to 1 Hz. The result is the module
   outputs **interpolated/extrapolated GGA epochs** at the 2 Hz rate, but only
   every second one carries a fresh RTK solution. The other one inherits the
   previous epoch's lat/lng (occasionally tweaked by velocity dead-reckoning).
   Because TinyGPS++ only fires `isUpdated()` when lat/lng actually changes,
   we see 1–4 Hz depending on how much actual movement there is between epochs.
   **This is the strongest hypothesis** and aligns with the datasheet's "1 Hz
   (RTK)" wording, separate from the PVT rate field.

2. **PAIR050 was silently dropped.** The walker firmware already mitigates this
   (`pair050Acked` flag, intent to retry up to 4×). Verify by adding a `weblogf`
   on every `PAIR001,050,*` reply observed in `parseGnssLine()`. If we never see
   the ACK with result=0 the module never accepted the rate change at all and
   the module is still running on its NV-stored default (1000 ms = 1 Hz).
   *Verification:* enable `DEBUG_NMEA_ECHO` for 30 s right after PAIR050 send,
   capture serial, confirm `$PAIR001,050,0*3E` present.

3. **Both GNGGA + GPGGA being counted.** Some LC29H firmware ships with talker
   IDs separated per constellation (`$GPGGA` vs `$GNGGA`). TinyGPS++ encodes any
   GGA into the same `location` slot, so this would *double* the perceived rate
   (one isUpdated() per talker per epoch). The walker has both `ggaFixQuality`
   (GN) and `ggaFixQualityGP` (GP) custom fields, suggesting we already see
   both. If actual GGA epochs are 1 Hz, two talker IDs would give us 2 Hz
   measured — which is close to what's observed.
   *Verification:* dump 5 s of raw NMEA, count `$GNGGA` vs `$GPGGA` lines.

4. **RTK engine drops/recovers.** When the RTK engine loses lock (e.g. on a
   correction-age spike, or a single bad MSM7 packet), the engine briefly
   re-converges and may emit two GGA epochs in quick succession before settling.
   At single-frequency RTK with our band-mismatched corrections this is
   plausible.

5. **NMEA parser drops on buffer overflow.** Ruled out by the throughput math
   above — at 1.5 KB/s steady state on a 256 B RX buffer drained 2×/loop-iter,
   you'd need a ~170 ms loop to overflow. The walker's `loop()` body is well
   under that, even with WebServer + TFT updates.

### How to verify which is dominant

Add this diagnostic to `gnssPump()` once, capture 30 s of telemetry:

```cpp
// Inside gnssPump(), after `gps.encode(c)`:
if (c == '\n') {
    static char tag[8] = {0};
    // tag holds first 6 chars of last line for talker counting
    // count $GNGGA, $GPGGA, $PAIR001 separately and dump every 5 s
}
```

If you see ≈2× as many `$GxGGA` lines as actual fix epochs (compare against
`PQTMVERNO` time offset), it's hypothesis #3. If you see no `$PAIR001,050,0`
ACK, it's #2. If both ACK and GGA count match the requested rate but the
TinyGPS++ updates are still ragged, it's #1 (RTK engine vs PVT engine mismatch).

---

## Recommendations

In priority order:

### 1. Stop fighting the DA. Go back to 1 Hz and densify samples spatially.

`PAIR050,1000` is the sweet spot for the LC29HDA — Quectel says so, every
forum thread confirms it, and the user's own measurement (FIX in <1 min, stable)
agrees.

To get more points from a 1 Hz fix without losing FIX:
- Lower the **spatial displacement filter** to ~5 cm so a slow walk gets one
  point per ~5 cm of motion (the recorder currently uses 2 cm per the comment
  on line 638, but with 1 Hz fixes the operator must walk slower or each fix
  covers 30+ cm at normal pace). Re-check the recorder logic and tighten the
  walking pace guidance in the README.
- **Add cubic-spline interpolation between fixes on the server side**, applied
  *after* the polygon is uploaded. The walker's UTM/lat-long is centimeter-noise-
  bound when in FIX; smoothing between samples reproduces corners well.
- Show the user a **suggested max walking speed** on the TFT: at 1 Hz / 5 cm
  target spacing, that's ~0.05 m/s = ~3 m/min. The user will hate that. So this
  is mostly a stop-gap; see option 2.

### 2. Swap LC29HDA → LC29HEA.

Same module footprint, same pinout, same Quectel ecosystem. The EA is the only
variant that supports >1 Hz RTK natively. rtklibexplorer's 2024 write-up
demonstrates 5 Hz RTK FIX achieved in under 10 s on Centipede corrections.
Cost delta is typically <€20.

Acquire path: the EA is sold by Mikroe ("GNSS RTK 5 Click") and by Gnss.store /
ardusimple as a bare module. Verify the user's source.

### 3. Send a saner PAIR boot sequence

Whether or not we swap to the EA, the boot sequence in `gnssPump()` could be
improved. Recommended (in order, with 200 ms gaps; only after first byte):

```c
sendGnssCommand("PAIR021");          // firmware version query (already there)
sendGnssCommand("PAIR050,1000");     // explicit 1 Hz (was: PAIR050,500)
sendGnssCommand("PAIR400,2");        // force RTK mode (defensive re-assert)
sendGnssCommand("PAIR062,3,0");      // silence GSA — saves ~100 B/s NMEA
sendGnssCommand("PAIR062,4,0");      // silence GSV — saves ~300 B/s NMEA
// Optional: persist to NV the first time, so future boots are fast:
// sendGnssCommand("PAIR513"); — but only if we're sure we don't need to change later.
```

### 4. Switch the NTRIP mountpoint to one that *might* help (if staying on DA)

Even though no current NL Centipede base streams L5, switching to **`BAAL`**
(which the user may already be on) explicitly gives us MSM7 over GPS+GLO+GAL+BDS.
That's the *best* a ZED-F9P base can do for an L1+L5 rover — at least we get
multi-constellation L1 carrier phase, not just GPS.

For a paid backup option that ships L5: try **Swift Skylark Nx**, **Trimble VRS
Now**, or **NTRIP Wim Veelo (Geodelta)** — those output triple-band MSM7 in NL
coverage. Cost-vs-benefit is unattractive given recommendation #2 is cheaper.

### 5. Add diagnostics to remove ambiguity from future debugging

- Log every `$PAIR001,<cmd>,<result>` to `weblogf` so we can see ACK/NACK
  history without USB. (We already capture `$PAIR020,*` for firmware; extend.)
- Log a 5 s NMEA talker histogram on demand (`/api/diag/nmea` endpoint).
- Surface the *measured* GGA rate (`gnssRateHz`) on the TFT — already there per
  line 692, ensure it's exposed to the React UI too.

---

## What we still don't know (after this research)

1. Whether the LC29HDA's RTK engine emits **interpolated** vs **fresh** RTK
   solutions when `PAIR050,500` is set — the protocol spec is silent on what
   the DA does internally. Hypothesis #1 in the rate-fluctuation section
   would resolve this if confirmed by inspecting the GGA `age-of-corrections`
   field epoch-to-epoch (look for repeated values).
2. Whether Quectel's "latest" LC29HDA firmware (`LC29HDANR11A04S_RSA`,
   distributed privately by `Jasper-Q` on the forum) changes the 1 Hz RTK
   limit. None of the public threads from 2024–2026 report a DA firmware
   that unlocks >1 Hz RTK; users who upgraded mention only "GST position
   error statistics" as a new feature. We'd need to email Quectel support
   and ask explicitly.
3. The exact firmware version currently installed on our LC29HDA — the
   walker's `PAIR021` reply (saved into `gnssFirmwareVersion`) tells us. If
   the user grabs that one string from the TFT and shares it, we can
   cross-check against the public firmware list. We strongly suspect
   `LC29HDANR11A03S_RSA` (the most widely distributed public release).
4. Whether the user's "NLDB" mountpoint name is a typo for `BAAL`, `NL_DB`,
   or a private mountpoint we don't see in the public sourcetable. Worth
   asking — if it's a private one we have no visibility into its message set.

---

## Sources

- [Quectel — GNSS LC29H Series product page](https://www.quectel.com/product/gnss-lc29h/)
- [Quectel LC29H Hardware Design v1.2 (Mikroe mirror)](https://download.mikroe.com/documents/datasheets/LC29HDAMD%20Datasheet.pdf)
- [Quectel LC29H DR&RTK Application Note v1.0](https://forums.quectel.com/uploads/short-url/sHocosk8FFCzLmszNndUJXUJfCS.pdf)
- [Quectel LC29H DR&RTK Application Note v1.2.0](https://forums.quectel.com/uploads/short-url/ncdKSn5cRYyDbOpfYmvGGs1vEIA.pdf)
- [Quectel LC29H&LC79H GNSS Protocol Specification v1.4](https://www.quectel.com/content/uploads/2022/02/Quectel_LC29H_SeriesLC79HAL_GNSS_Protocol_Specification_V1.4.pdf)
- [Quectel forum — LC29HDA RTK Rover not RTK Fixed (band mismatch)](https://forums.quectel.com/t/lc29hda-rtk-rover-not-rtk-fixed/46060)
- [Quectel forum — Float RTK Mode to Fixed RTK using LC29HBS and LC29HDA](https://forums.quectel.com/t/float-rtk-mode-to-fixed-rtk-using-lc29hbs-and-lc29hda/37451)
- [Quectel forum — LC29HDA firmware request thread](https://forums.quectel.com/t/lc29hda-firmware-request/52686)
- [Quectel forum — LC29HEA Adjustable Update Rate (firmware unlock history)](https://forums.quectel.com/t/firmware-request-lc29hea-adjustable-update-rate-for-ardupilot-utilization/33839)
- [rtklibexplorer — Configuring the LC29HEA for real-time RTK (5 Hz FIX demo)](https://rtklibexplorer.wordpress.com/2024/05/06/configuring-the-quectel-lc29hea-receiver-for-real-time-rtk-solutions/)
- [rtklibexplorer — Dual frequency RTK <$60 with Quectel LC29HEA](https://rtklibexplorer.wordpress.com/2024/04/28/dual-frequency-rtk-for-less-than-60-with-the-quectel-lc29hea/)
- [DIY Robot Lawn Mower forum — LC29H GPS/RTK HAT (5/7/10 Hz field results)](https://www.diy-robot-lawn-mower.com/threads/lc29h-xx-gps-rtk-hat.127/)
- [Centipede caster.centipede.fr:2101 live sourcetable](http://caster.centipede.fr:2101/) (fetched 2026-05-22; no `NLDB` mountpoint, NL bases are `ANT1` and `BAAL`)
- [Centipede-RTK — Host a base / triple-band recommendation](https://www.centipede-rtk.org/host-rtk-base)
- [RTCM-NTRIP wiki — STR sourcetable carrier field semantics](https://software.rtcm-ntrip.org/wiki/STR)
- [u-blox ZED-F9P Integration Manual (L1+L2 default, optional L5 variant)](https://content.u-blox.com/sites/default/files/ZED-F9P_IntegrationManual_UBX-18010802.pdf)
- [mrichar1/esp32-gps — ESP32 NTRIP controller tested with LC29H(BS/DA/EA)](https://github.com/mrichar1/esp32-gps/)
- [GLAY-AK2/NTRIP-client-for-Arduino](https://github.com/GLAY-AK2/NTRIP-client-for-Arduino)
