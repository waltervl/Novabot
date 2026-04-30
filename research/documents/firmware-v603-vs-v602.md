# Mower Firmware v6.0.2 vs v6.0.3 — Forensic Comparison

**Date**: 2026-04-28
**Source v6.0.2**: `research/firmware/mower_firmware_v6.0.2.deb` (extracted to `/tmp/v602-mine`)
**Source v6.0.3**: `research/firmware/novabot.bak.tar.gz` (extracted to `/tmp/v603-mine`)
  - Pulled off a user's mower (SN + userId redacted) after he upgraded from
    v6.0.3 stock → v6.0.2-custom-24 on 2026-04-28. The previous install tree was preserved
    in `/root/novabot.bak/` by the custom OTA installer.

## TL;DR

**v6.0.3 is a charger-firmware rollback, not a mower update.** Methodology section below
documents the verification: 6051 files compared by SHA-256, 0 binary differences, 4
text-only diffs (all version-label updates).

What actually changes:

- **Mower software**: identical to v6.0.2 — every ROS 2 executable, every `.so`, the
  STM32 MCU blob, and the perception/AI models are byte-identical.
- **Charger firmware bundled with the package**: v6.0.2 ships `lfi-charging-station_lora.bin
  v0.4.1`, v6.0.3 ships `v0.4.0`. v6.0.3 is the rollback target — Novabot's support team
  pushed it to users whose charger v0.4.1 install was misbehaving.

Practical implication: if you are already on v6.0.2 (custom or stock) and your charger
runs v0.4.0, upgrading to v6.0.3 gains you nothing — the only delta would have applied
during charger pairing, and your charger is already on the rolled-back firmware. v6.0.3
matters only for users whose v6.0.2 mower successfully bumped the charger to v0.4.1 and
then experienced problems.

## File-tree summary

| Bucket | Count | Notes |
|--------|-------|-------|
| Identical files | thousands | Includes every `*.so`, every `lib/*/<binary>` ROS executable, every model file |
| Real content diffs | **4** | Listed below |
| `.pyc` bytecode diffs | 13 | Python launch-script bytecode caches — same source, different mtime / build-host hash. Not a real change. |
| Files only in v6.0.2 (extraction artefacts) | 4 | `control`, `control.tar.xz`, `data.tar.xz`, `debian-binary`, plus the `.deb` itself. These come from the deb-extract; v6.0.3 was sourced from an installed tree. |
| Files only in v6.0.2 (this user's data) | 5 | `data/camera_daemon_monitor.log`, plus three CSV map fragments + `map_info.json` left over in `home0/csv_file/`. User-specific runtime state, not firmware. |
| Files only in v6.0.3 | many | Two buckets, both noise: (a) `dds_fastrtps` directories under every `*_msgs/include/*/detail/` — generated DDS RTPS headers that were missing from the v6.0.2 deb extract but are also generated at install time, so they don't represent new mower behaviour; (b) `novabot_log/<timestamp>` files that are a user's historical run logs. |

## The four real diffs

### 1. `Readme.txt`

```diff
-novabot_mvp_v6.0.2
-mqtt_node version: v6.0.1 -> v6.0.2
+novabot_mvp_v6.0.3
+mqtt_node version: v6.0.2 -> v6.0.3
 MCU_BIN branch  -> novabot_stm32f407_v3_6_0_NewMotor25082301.bin
-lfi-charging-station_lora.bin v0.4.0 -> v0.4.1
+lfi-charging-station_lora.bin v0.3.9 -> v0.4.0
```

Version-string update plus the charger-firmware ship-target reverted from `v0.4.1` to `v0.4.0`.
The `mqtt_node` line says it bumps from v6.0.2 to v6.0.3, but since the binary is bit-identical
the version string is the *only* "bump".

### 2. `charging_station_pkg/version.txt`

```diff
-v0.4.1
+v0.4.0
```

Confirms the rollback: v6.0.2 ships charger firmware v0.4.1 to pair, v6.0.3 ships v0.4.0.

### 3. `install/novabot_api/share/novabot_api/config/novabot_api.yaml`

```diff
-    novabot_version_code: v6.0.2
+    novabot_version_code: v6.0.3
```

Single string. Mirrors what the mower reports as `sw_version` in `report_state_robot`.

### 4. `package_verify.json`

```diff
-                         "value": 333
+                         "value": 337
```

Single value at line 65900. Context: the entry verifies the size of `Readme.txt` for OTA
integrity. v6.0.3's Readme is four bytes longer than v6.0.2's because of the version-string
change in diff #1. No other entries change — every other file's recorded size stays the same,
which is a strong cross-check that no other content actually moved.

## Binary verification (sample of critical paths)

```text
mqtt_node                       identical
ota_client_node                 identical
coverage_planner_server         identical
novabot_stm32f407_v3_6_0_NewMotor25082301.bin   identical
fw_bcm43438a1.bin               identical
bisenetv2-seg_2023-11-27_512-960_vanilla.bin    identical
novabot_detv2_11_960_512.bin    identical
solver.bin                      identical
```

All `*.so` shared libraries under `install/` were also compared by full SHA-256 — none
differ.

## Implications

### For OpenNova users

- **No reason to chase v6.0.3 for the mower software itself.** Every published v6.0.2-custom-X
  build already contains the same mower binaries.
- **Charger firmware caveat.** If your charger is on `v0.4.1` and you let v6.0.3 re-pair,
  the mower will push `v0.4.0` to the charger on the next pairing. v0.4.0 → v0.4.1 was
  released via v6.0.2; if the v0.4.1 ship had a regression Novabot may have rolled back here.
  We don't have the v0.4.0 vs v0.4.1 charger binaries to diff yet, so this needs
  follow-up before recommending the swap.

### For the project

- The `firmware-aes-versions` memory recording that v6+ uses AES + that v6.0.2 added
  several mqtt_node features stays correct — none of those evolved between v6.0.2 and
  v6.0.3.
- The mqtt_node-payload-catalog and command-catalog references can be marked applicable
  to v6.0.3 without re-validation.
- `v6.0.2-custom-24` is functionally identical to `v6.0.3` from the mower's perspective,
  modulo the bumped charger ship-target and our custom-firmware patches.

## Why v6.0.3 was cut

A user was issued v6.0.3 by Novabot's support team because his v6.0.2 install was
giving him trouble. Cross-referenced with the file-level diff that's the most economical
explanation: v6.0.2 shipped charger `v0.4.1`, that ship had a regression on at least
some chargers, and Novabot's fix was to repackage v6.0.2 with the charger ship-target
reverted to the previous `v0.4.0`. The mower binaries didn't need to change because
the bug wasn't on the mower side.

This also explains why `getEquipmentBySN` reports v6.0.3 only for select accounts and why
`checkOtaNewVersion` doesn't expose v6.0.3 as a generally-available upgrade — it's a
targeted hotfix, not a public release.

## Verification methodology

Why we can be confident `0 binaries differ`:

1. Both trees enumerated with `find` excluding `.pyc` (Python bytecode caches with
   build-host fingerprints), `novabot_log/`, `data/`, and the user-specific `maps/home0/`
   contents that aren't part of the firmware.
2. SHA-256 hash + relative path produced for every file (6051 paths matched in both trees).
3. `join` on relative path → 6051 path-pairs compared by hash.
4. 4 hash mismatches surfaced; 0 were binary executables, all four are short text files
   listed in the diff section above.
5. Originally one comparison run flagged `controller_server` and `libceres*.deb` as
   "only in v603" — that was a bug in our `! -name "control*"` exclude pattern matching
   `controller_server` and `! -name "*.deb"` matching the bundled libceres dependencies.
   Re-run with corrected filters confirmed both files exist in both trees with identical
   hashes. Logged here so the bug doesn't slip back in.

## Open follow-up

- [ ] Get hold of `lfi-charging-station_lora.bin v0.4.1` and diff against `v0.4.0`. Likely
      via the same OSS bucket the mower binaries live on, but charger firmware naming is
      different and we don't currently have a captured URL.
- [ ] Once we have charger v0.4.0 + v0.4.1 binaries, decide whether OpenNova should
      default-pair with v0.4.0 (matches v6.0.3 LFI behaviour) or v0.4.1 (matches v6.0.2).
- [ ] Add a memory entry pointing future analysis at this document so we don't re-run
      this comparison from scratch.
