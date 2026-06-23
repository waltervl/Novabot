# Novabot "Modify Map" (add / extract) — Flutter v2.4.0 reverse-engineering

Source: `research/blutter_output_v2.4.0/` (pp.txt + `asm/flutter_novabot/pages/build_map/build_map_page/logic.dart`).
Goal: how the official Novabot app edits an **existing** map by driving a new
boundary — expanding (add) or retracting (extract) it. OpenNova lacks this.

## 1. There is a 4th map type the OpenNova app never implemented

`BuildMapType` enum (pp.txt):

| enum value | name       | asm obj   |
|-----------:|------------|-----------|
| 0          | `map`      | a4b941    |
| 1          | `obstacle` | a4b921    |
| 2          | `unicom`   | a4b901    |
| **3**      | **`modify`** | **a4b8e1** |

UI strings (pp.txt): title **"Modify Map"**, intro **"Remote control the machine
to the lawn edge you want to modify, create a new boundary, and complete the map
modification."**, assets `ic_modify1.png` / `ic_modify2.png`, success toast
**"modify successful."**, button **"Retract"**.

## 2. Commands each button sends (PROVEN — from clickStart/clickStop/clickRetract)

`BuildMapPageLogic` (build_map_page/logic.dart). All payloads go through
`_writeDataToDevice(...)` (same BLE/MQTT writer the normal mapping uses).

**clickStart** (0x909b9c) builds `add_scan_map` with a per-type `type` field
(value stored at field_23, proven by `mov x16,#N`):

| type selected | command (first map = `start_scan_map`) | wire `type` | asm |
|---------------|----------------------------------------|------------:|-----|
| map (0)       | start_scan_map / add_scan_map          | 1¹          | 0x909e94+ |
| obstacle (1)  | add_scan_map                           | **2**       | 0x90a180 `mov x16,#2` |
| unicom (2)    | add_scan_map                           | **4**       | 0x90a2e8 `mov x16,#4` |
| **modify (3)**| add_scan_map                           | **8**       | 0x90a450 `mov x16,#8` |

Payload shape (modify): `{"add_scan_map":{"model":"manual","mapName":"<map>","type":8,"cmd_num":N}}`

**clickStop** (0x90a4..) → `{"stop_erase_map":{"cmd_num":N}}`  (0x90a5bc)
**clickRetract** (0x90a6c4) → opens `showRetractModal`; on confirm the closure
(0x90b3fc) → `{"start_erase_map":{"cmd_num":N}}`  (0x90b43c)
**clickReset** → `{"reset_map":...}` (0x90b5b4)  **clickConfirm** → `save_map`  **clickDone**, **quit_mapping_mode** also present.

`cmd_num` = a process-wide incrementing static counter (LoadStaticField 0x1110, +1, store back).

## 3. Reconstructed add vs extract flow (LIKELY — not byte-proven end-to-end)

- **Enter modify:** `add_scan_map type:8` on the target map → drive a new boundary
  at the lawn edge.
- **ADD (expand):** drive the new boundary *outside* the current edge, finish →
  `save_map`. The new outline supersedes the old → map grows.
- **EXTRACT (retract):** press **"Retract"** → `start_erase_map` → drive the loop
  to remove → press **Stop** → `stop_erase_map` → enclosed area subtracted →
  `save_map`.

The firmware decides geometry; the app only sends the bracket commands above.
`start_erase_map`/`stop_erase_map` are the **extract** primitives (NOT just
cancel — though OpenNova's discard reuses `stop_erase_map` to bail a session).

## 4. FIRMWARE SIDE — what mqtt_node + the mapping node actually expect (AUTHORITATIVE)

`api_add_scan_map` (mqtt_node, ghidra 0x2e5210) parses `model`/`mapName`/`type`
(`Json::Value::asInt`) and forwards them **verbatim** to the ROS service client
(`this[0x50] = type`) — **mqtt_node does NO remapping of `type`**.

The semantics live in `mapping_msgs` (`.../install/mapping_msgs/share/mapping_msgs/srvs/`).
The Chinese comments are the vendor's own spec:

**`Recording.srv`** (the live polygon scan = start/add_scan_map):
```
#type表示录制的多边形围起来的区域是什么类型；0表示可通行区域，1表示障碍物区域，2表示联通区域
uint8 type   # 0 = work/passable, 1 = obstacle, 2 = unicom(channel)
```
→ **Confirms OpenNova's values are correct: work=0, obstacle=1, unicom=2.**
There is **no recording type 3/4/8** — the firmware scan only knows 0/1/2.

**`MappingControl.srv`** (file-level map editing — the real "modify" surface):
```
#type: 1.重新建图 2.添加子图 3.删除子图 4.增加整图(弃用) 5.删除整图(弃用)
#      6.添加联通域 7.未用 8.添加障碍物 9.删除障碍物 10.添加子图到充电桩联通域(弃用)
```
= 1 remap · 2 add submap · 3 delete submap · 6 add unicom · 8 add obstacle ·
  9 delete obstacle · (4,5,10 deprecated, 7 unused).

**`Mapping.srv`** (the save_map total/sub + overlap rejection):
```
uint8 type            # 0 = sub map, 1 = total map
uint8 error_code  →  1 OVERLAPING_OTHER_MAP · 2 OVERLAPING_OTHER_UNICOM · 3 CROSS_MULTI_MAPS
```
→ This is the source of the **error-120 "overlap" save rejection** OpenNova already handles.

**Erase (= EXTRACT):** `start_erase_map` / `stop_erase_map` are their own ROS
service clients in mqtt_node (separate from Recording). No `.srv` named *erase*
in `mapping_msgs`, so they bind to a service in `novabot_mapping` itself — these
are the firmware primitives that subtract an area. (Exact request fields not yet
dumped — see §6.)

## 5. RECONCILED CONCLUSION — how modify add/extract really works

- The firmware has **no "modify type 3/8" scan**. The Flutter app's
  `BuildMapType` (0/1/2/3) and clickStart's bitmask bytes (1/2/4/8) are an
  **app-internal enum**; what the mapping node accepts is constrained to the
  `.srv` contracts above.
- **ADD area to a work map** = record a new work boundary (`Recording` **type 0**)
  that overlaps/extends the existing one; the mapping node merges it (or
  `MappingControl` 2 "add submap"). Overlap that's illegal → `Mapping`
  error_code 1/2/3 (the 120 family).
- **EXTRACT / retract area** = `start_erase_map` → drive the loop → `stop_erase_map`.
  Proven on BOTH sides: Flutter `clickRetract`→`start_erase_map`,
  `clickStop`→`stop_erase_map`, and matching service clients in mqtt_node.

## 7. ✅ LIVE CAPTURE — AUTHORITATIVE (2026-06-21, LFIN2230700238, mqtt_node log)

Captured a real Novabot-app "Modify Map" session: drove one loop to ADD area,
then one loop to EXTRACT area. **Both produced byte-identical wire traffic:**

```
add_scan_map  {"model":"manual","mapName":"null","type":4,"cmd_num":N}   ← edit mode
stop_scan_map {"value":false,"cmd_num":N}
save_map      {"mapName":"map0","type":0,"cmd_num":N}                     ← sub
save_map      {"mapName":"map0","type":1,"cmd_num":N}                     ← total
get_map_outline {"map_name":"all"}
get_map_list  null
```
Response: `add_scan_map_respond {result:0, value:{map_position:{x,y}}}` while driving;
`stop_scan_map_respond {result:0}`; `save_map_respond {result:0, value:0}` ×2.

**Findings (supersede §1-3 speculation):**
1. **Modify scan = `add_scan_map type:4`** (NOT 8). Confirms the firmware
   `MAPPING_EDIT_MODE` reading and that unicom≠4 (unicom=2, per Recording.srv).
   The Flutter `modify=8` byte was an app-internal enum, not the wire value.
2. **`mapName:"null"`** (literal string) on the scan — firmware derives the
   target work map from context (like obstacle's `"map"`).
3. **Save = `mapName:"map0"`, type:0 then type:1** — standard two-save, same as work.
4. **`stop_scan_map value:false`** (like work, not unicom's true).
5. **NO `start_erase_map`/`stop_erase_map`, no MappingControl, no add/extract flag.**
   Add vs extract is decided **entirely by the firmware from the driven loop's
   geometry** — outward boundary = expand, inward = retract. App sends identical
   commands. `clickRetract`→`start_erase_map` is a separate/legacy path not used
   by the normal Modify drive.

### OpenNova implementation spec (ready to build)
One new `MapBuildType: 'modify'` →
- start: `add_scan_map {model:"manual", mapName:"null", type:4, cmd_num}` (mower
  already has ≥1 work map; first-map guard applies).
- stop:  `stop_scan_map {value:false}` → `save_map {mapName:<editedMap>, type:0}`
  → `save_map {mapName:<editedMap>, type:1}` → `get_map_outline {all}`.
- No charger positioning, no channel prompt. No add/extract toggle — single
  "Modify / redraw boundary" mode; the firmware merges by geometry.
- **`save_map` mapName is the literal constant `"map0"` — NOT the selected map.**
  VERIFIED 2026-06-21: mower had map0/map1/map2; user selected & drove map1; wire
  sent `save_map {mapName:"map0"}`; on disk **map1** changed (map1_work.csv,
  map1.pgm/png/yaml @17:17) and **map0 was untouched** (mtime 15:01). The firmware
  picks the edited map from the driven-loop geometry (scan `mapName:"null"`), and
  ignores the save mapName for selection. So OpenNova should send the SAME fixed
  `save_map {mapName:"map0", type:0/1}` regardless of which map is being edited —
  do NOT substitute the selected map name (matches official app, firmware geometry).

## 6. (resolved by §7) — the one byte question

mqtt_node forwards `type` verbatim, but Ghidra only resolved the *SetChargingPose*
client template — it didn't cleanly show whether `add_scan_map_client` binds to
`Recording` (0/1/2) or `MappingControl` (1-10). So the exact `type` byte the
Novabot app puts on the wire for a **modify scan**, and the `start_erase_map`
request fields, are the only gaps. One real Novabot-app modify session in the
mqtt_node log nails both. Everything else above is firmware-contract-backed.

## (was 4) earlier note — superseded by §4-5

These decompiled wire `type` values (obstacle=2, unicom=4, modify=8 — a clean
`2^enumIndex` bitmask) **conflict with OpenNova's live-verified values**
(`MappingScreen.tsx`: obstacle=1, unicom=2, "verified 2026-04-19 live capture",
with a note that firmware treats type:4 as `MAPPING_EDIT_MODE`).

Possible explanations (unresolved from decompilation alone):
- the live capture was an older app build, and v2.4.0 switched to the bitmask;
- a remap happens between `clickStart` and the actual publish;
- firmware accepts both and assigns different meaning.

**Action before building modify into OpenNova:** capture a real Novabot-app
modify session on a live mower (mqtt_node log) and read the actual
`add_scan_map` / `start_erase_map` / `stop_erase_map` / `save_map` bytes — the
same standard every other map type was held to. Do NOT ship `type:8` on faith.
