# Walker RTK IO Isolation Design

**Status:** Proposed 2026-05-27, feature branch `feature/walker-rtk-io-architecture`.

## Goal

Make the ESP32 walker firmware deterministic under RTK load by separating the
Web UI, LoRa RTCM3 stream, GNSS UART, TFT/LVGL UI, and file-system work into
independent owners. The RTK correction stream must keep flowing even while the
web UI is open, logs are enabled, maps are loaded, or the TFT is rendering.

The second goal is to stop treating the Novabot charger LoRa frame as a
guaranteed LC29HDA input stream. The charger sends command `0x31` chunks from
its GNSS/RTK UART. The walker must prove which bytes are valid RTCM3 correction
data, feed the LC29HDA through one serialized path, and avoid interleaving PAIR
commands with correction data.

## Current Findings

### ESP32 resource ownership is too loose

The current firmware has multiple paths that can write to the LC29HDA UART:

- `tools/rtk-walker/src/walker_lora.cpp` forwards LoRa command `0x31` payloads
  directly with `gnssSerial.write(...)`.
- `tools/rtk-walker/src/main.cpp` forwards NTRIP chunks directly with
  `gnssSerial.write(...)`.
- `sendGnssCommand(...)` writes PAIR commands directly from GNSS setup logic and
  from the web endpoint `/api/gnss/send`.

That means RTCM bytes and ASCII PAIR commands can be interleaved unless every
caller happens to run at a safe moment. The observed repeated
`$PAIR001,000,4*3F` is consistent with the LC29HDA receiving a malformed command
or command-like byte sequence while the correction stream is active.

Web and UI work is also still too close to realtime work:

- `/bundle.novabundle` is built and streamed inside the HTTP handler.
- Some map/session/file operations use LittleFS synchronously.
- LVGL owns its own task, but UI callbacks and screen refresh logic can still
  trigger heavier work while RTK is active.

### Quectel LC29HDA input requirements

Official Quectel documentation says LC29H BA and DA support RTCM 10403.3 input
messages including:

- reference station messages `1005` and `1006`
- GPS MSM4/MSM7 `1074` and `1077`
- GLONASS MSM4/MSM7 `1084` and `1087`
- Galileo MSM4/MSM7 `1094` and `1097`
- QZSS MSM4/MSM7 `1114` and `1117`
- BDS MSM4/MSM7 `1124` and `1127`

Sources:

- Quectel LC29H BA/CA/DA DR&RTK Application Note V1.0:
  https://quectel.com/content/uploads/2024/02/Quectel_LC29HBACADA_DRRTK_Application_Note_V1.0.pdf
- Quectel LC29H Series/LC79H(AL) GNSS Protocol Specification V1.4:
  https://www.quectel.com/content/uploads/2022/02/Quectel_LC29H_SeriesLC79HAL_GNSS_Protocol_Specification_V1.4.pdf

The same protocol spec defines `PAIR400,<Mode>` as "DGPS correction data source"
with:

- `0` = no DGPS data source
- `1` = RTCM
- `2` = SBAS
- `3` = SLAS

It also states that this command is only supported on LC29H AA and LC79H AL.
For the walker this makes automatic `PAIR400,2` wrong for two reasons: it selects
SBAS rather than RTCM, and it is not documented as supported by LC29HDA. The
LC29HDA should instead be fed supported RTCM3 input messages directly.

### Novabot charger firmware behavior

The decompiled charger firmware supports the idea that LoRa command `0x31` is a
raw relay from the charger's RTK/GNSS UART:

- The RTK UART receiver pushes bytes into a stream buffer and queues local
  command `3`.
- The LoRa task handles command `3`, prefixes the outgoing buffer with byte
  `0x31`, reads a chunk from that stream buffer, optionally checks whether the
  buffer contains `GNGGA`, and sends it over LoRa.

This is not proof that the stock mower feeds the whole mixed stream directly to
a GNSS chip. The mower firmware must still be inspected around `gps_raw`,
`bestpos_parsed_data`, and `chassis_lora_set` to understand the original
consumer path.

## Proposed Architecture

### Principle: one owner per mutable resource

Each hardware or heavy subsystem gets exactly one owner. Other subsystems talk
to it through queues, snapshots, or jobs.

| Resource | Owner | Other code may do |
|---|---|---|
| LC29HDA UART RX/TX | `gnss_io_task` | enqueue TX bytes/commands, read snapshots |
| LoRa UART RX/TX | `lora_io_task` or RTK side of `gnss_io_task` | enqueue config requests |
| RTCM parse state | `rtcm_router` | read counters and latest decoded messages |
| HTTP server | `web_task` | read snapshots, enqueue jobs |
| LVGL object tree | LVGL/task UI layer | enqueue UI intents, read snapshots |
| LittleFS/map/bundle work | `storage_worker_task` | enqueue jobs, read job status |

No web handler, LVGL callback, NTRIP pump, or LoRa parser should call
`gnssSerial.write(...)` directly after this refactor.

### GNSS TX queue

All outbound bytes to the LC29HDA go through a single queue:

```cpp
enum class GnssTxKind : uint8_t {
  RtcmFromLora,
  RtcmFromNtrip,
  PairCommand,
};

struct GnssTxItem {
  GnssTxKind kind;
  uint16_t len;
  uint32_t enqueuedMs;
  uint8_t bytes[256];
};
```

The `gnss_io_task` owns the UART and drains this queue. It must:

- never interleave two queued items
- prefer RTCM items while RTK is active
- send PAIR commands only after a short idle gap or between complete RTCM frames
- measure queue depth, dropped items, and max wait time
- keep reading LC29HDA output even when the TX queue is busy

### RTCM router

The RTCM router sits between LoRa/NTRIP sources and the GNSS TX queue.

It maintains a byte-level RTCM3 parser:

```text
search 0xD3 -> read length -> read payload -> read CRC24Q -> emit valid frame
```

For every source it tracks:

- bytes in
- valid frames
- invalid CRC frames
- partial frame timeouts
- message type histogram
- source-to-LC29 latency
- age of last valid reference station message
- age of last valid MSM observation burst

The router supports two feed policies:

| Policy | Behavior | Purpose |
|---|---|---|
| `raw_0x31` | serialize the whole `0x31` payload to LC29HDA | diagnostic fallback for comparing against older firmware |
| `rtcm_only` | forward only complete CRC-valid RTCM3 frames | stable LC29HDA input; strips charger NMEA/ASCII noise |

Outdoor testing on 2026-05-27 proved that `raw_0x31` can hold RTK FIX while
stationary, but movement triggers repeated `$PAIR001,000,4*3F`, `dgpsAge=null`,
and a drop to DGPS even though LoRa RTCM stays current. Switching to
`rtcm_only` stopped the PAIR spam and held RTK FIX with the queued GNSS TX path,
so `rtcm_only` is now the default.

### LC29HDA boot configuration

Keep the boot sequence minimal and LC29HDA-compatible:

- keep `PAIR021` as a firmware diagnostic
- keep `PAIR050,1000` for LC29HDA 1 Hz RTK operation
- remove automatic `PAIR400,2`
- do not send `PAIR513` automatically on every boot
- optionally add `PAIR062` commands later to reduce unnecessary NMEA output, but
  only after the RTK stream is stable

Every PAIR command should be tagged in the GNSS TX queue so the ACK can be
correlated with the command that was sent.

### Snapshots instead of shared realtime state

Realtime tasks publish a compact status snapshot:

```cpp
struct WalkerRealtimeSnapshot {
  uint32_t updatedMs;
  uint32_t gnssRxBytes;
  uint32_t gnssTxBytes;
  uint32_t loraRxBytes;
  uint32_t rtcmValidFrames;
  uint32_t rtcmBadCrcFrames;
  uint16_t rtcmLastType;
  uint16_t gnssTxQueueDepth;
  uint16_t gnssTxQueueHighWater;
  uint32_t maxGnssLoopLatencyUs;
  uint32_t maxWebLoopLatencyUs;
  uint32_t maxUiLoopLatencyUs;
  uint32_t pairAckOk;
  uint32_t pairAckErrors;
};
```

Web UI and TFT may only read this snapshot. They must not take locks that block
the realtime RTK path.

### Storage worker

LittleFS, bundle building, map loading, map export, and session persistence move
behind a low-priority worker queue. Web and TFT handlers return or render a job
state:

```cpp
enum class StorageJobKind : uint8_t {
  BuildBundle,
  LoadMapPreview,
  SaveSession,
  ExportRtcmCapture,
};
```

Long jobs should run in small chunks and call `vTaskDelay(1)` or equivalent
between chunks. During active mapping/RTK acquisition, non-essential jobs can be
paused or deprioritized.

## Implementation Phases

### Phase 1: make current behavior measurable

Add counters and snapshots without changing feed behavior:

- loop latency per task
- GNSS TX direct-write call sites
- LoRa frame sizes and gaps
- RTCM type histogram
- `PAIR001` ACK/error histogram
- max HTTP handler duration
- max LittleFS job duration

Acceptance: while outside with LoRa active, `/api/status` can show whether RTCM
messages are arriving continuously and whether PAIR errors occur during the same
window.

### Phase 2: single LC29HDA UART owner

Introduce the GNSS TX queue and move all LC29HDA writes through it. Remove direct
writes from LoRa, NTRIP, and `/api/gnss/send`.

Acceptance: code search shows exactly one `gnssSerial.write(...)` owner for
LC29HDA TX. LoRa still reaches FLOAT/FIX with the same feed policy as before.

### Phase 3: LC29HDA-safe boot config

Remove automatic `PAIR400,2` and stop saving settings with `PAIR513` on every
boot. Keep `PAIR050,1000`.

Acceptance: boot log shows PAIR commands are acknowledged or explicitly reported
as unsupported/error, and no repeated `$PAIR001,000,4*3F` appears during RTK
streaming.

### Phase 4: RTCM router feed policy test

Capture 60 seconds of LoRa `0x31` data outside and compare:

- `raw_0x31` feed
- `rtcm_only` feed

Acceptance: the chosen policy produces stable RTK FIX while walking, with no
seconds-long drops to GPS unless the RTCM input stream itself has a measured gap.

Result: `rtcm_only` is the chosen policy. `raw_0x31` remains available through
`/api/config/lora` for diagnostics only.

### Phase 5: isolate Web UI, LVGL, and LittleFS

Move heavy web endpoints and UI-triggered file work to `storage_worker_task`.
Keep Web UI RTCM/console logging default off, with explicit toggles.

Acceptance: opening the Web UI, polling status, and loading TFT map screens does
not increase RTK source-to-LC29 latency beyond the configured threshold.

### Phase 6: stock mower firmware validation

Inspect the decompiled mower pipeline around:

- `gps_raw`
- `bestpos_parsed_data`
- `chassis_lora_set`
- LoRa action/service handling

Acceptance: document whether stock Novabot forwards `0x31` bytes into a GNSS
receiver or consumes parsed RTK/GPS state in ROS. If stock behavior differs from
the walker, update the walker feed policy accordingly.

## Test Plan

### Bench tests over USB

- Build with PlatformIO.
- Boot with USB monitor attached.
- Confirm no direct GNSS UART writes outside the owner task.
- Confirm `/api/status` stays responsive while the RTCM debug log is disabled.
- Confirm `/api/rtcm/log` only allocates/serializes when explicitly enabled.

### Outdoor LoRa tests

Record these windows:

- stationary boot to first FLOAT/FIX
- stationary 5 minutes after FIX
- walking 10 meters slowly
- walking a full map loop

For each window save:

- fix state timeline
- satellite count
- DGPS age/station if available
- LoRa frame gaps
- RTCM type histogram
- queue high-water marks
- PAIR ACK/error counters

The bug is considered fixed only when RTK FIX remains stable while walking and
the logs show that any remaining drop from FIX to FLOAT/GPS matches a real gap or
invalidity in the incoming RTCM stream.

## Risks

- `rtcm_only` may initially look worse if the LoRa payload is fragmented in a way
  our parser does not reassemble correctly. This is now covered by keeping
  `raw_0x31` as a runtime diagnostic fallback while defaulting to `rtcm_only`.
- Moving LittleFS work behind a worker changes UI timing. Keep UI behavior simple
  at first: show busy/progress state, then refresh from snapshot.
- LC29HEA will support higher RTK rate later, but the IO isolation is still
  required. A faster GNSS module will make byte interleaving and task starvation
  more visible, not less.

## Open Decisions

- Whether NTRIP should remain as an automatic fallback while LoRa is active, or
  become a manual source selector during debugging.
- Whether to add a temporary raw capture endpoint that writes to LittleFS, or to
  stream capture data to the connected browser/client to avoid flash wear.
