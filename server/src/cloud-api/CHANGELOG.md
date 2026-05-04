# cloud-api CHANGELOG

Format: most-recent first. Each entry is dated and names the endpoint(s) affected.

## 2026-05-04 — Work records: area precision, selectMap formatting, finished detection (issue #17 round 2)

- `routes/message.ts`: `POST /api/novabot-message/message/queryCutGrassRecordPageByUserId`
  three bug-fixes after waltervl follow-up screenshots:

  1. **workArea displayed with full float precision** (`298.9381103515625 m²`).
     Now rounded to 2 decimals (`298.94`) via `formatWorkArea()` — matches
     stock cloud display.

  2. **selectMap returned raw JSON** (`["map10"]` rendered literally in app).
     New `formatSelectMap()` parses the JSON, resolves canonical `mapN` slot
     ids to user aliases via `mapRepo.findBySnAndCanonical`, and collapses
     to `"All maps"` when the selection covers every work-map for the SN.
     Equipment_id → mower_sn lookup is cached per request.

- `routes/equipmentState.ts`: `POST /api/nova-data/equipmentState/saveCutGrassRecord`
  broaden `looksFinished` signal set so a normally-completed multi-map
  session that ends with `Work:CANCELLED ... Recharge: FINISHED` is no
  longer mis-tagged as `interrupted artificially`. Also accept
  `Recharge: FINISHED` and `Recharge: WAIT` as finished signals.

## 2026-05-01 — Work records: cutting-height, workTime unit, dateTime format (issue #17)

- `routes/equipmentState.ts`: `POST /api/nova-data/equipmentState/saveCutGrassRecord`
  three bug-fixes for reporter waltervl (Novabot v2.4.0 + mower v5.7.1 stock):

  1. **cutGrassHeight stored as wire+2**: The sensor-cache fallback was doing
     `target_height + 2` converting the wire enum (0-7) to user_cm before
     storing. The stored value MUST be the wire enum — identical to what the
     mower POSTs directly and what LFI cloud stores. The Novabot app and
     dashboard display `cutGrassHeight + 2` cm; storing user_cm caused the
     display to show `(user_cm + 2)` = two too many. Fix: removed `+ 2` from
     the sensor-cache fallback (`cutGrassHeight = wire`, not `wire + 2`).

  2. **workTime always 0**: The sensor-cache key `cov_work_time` carries
     seconds, but `work_records.work_time` is minutes. The old code stored
     seconds as minutes (effectively multiplying by 60 in the wrong direction).
     Fix: sensor cache fallback now tries `valid_cov_work_time` (already
     minutes) first; falls back to `Math.round(cov_work_time / 60)`.

  3. **dateTime formatted as ISO-8601**: Mower v5.7.1 sends
     `2026-04-29T18:13:10.94Z`. Server now normalises any string containing
     `'T'` to SQL format `2026-04-29 18:13:10` via
     `new Date(raw).toISOString().replace('T', ' ').slice(0, 19)`.

- `__tests__/contract/equipmentState.saveCutGrassRecord.test.ts`: 12 new
  regression tests — one per bug plus dedicated regression guards — all green.

## 2026-04-29 — Schedule: persist cutGrassHeight / area / timezone

- `routes/cutGrassPlan.ts`: `POST /api/nova-data/appManage/saveCutGrassPlan`
  +  `POST /api/nova-data/appManage/updateCutGrassPlan` now write the
  `cutGrassHeight`, `area` and `timezone` fields the Novabot app sends
  (instead of silently dropping them). `queryPlanFromMachine` and
  `queryCutGrassPlan` echo the stored values back so the mower can set
  blade height + area scope. Without this fix the mower received
  `cutGrassHeight:null` in the plan and silently refused to start the
  scheduled run — LFI cloud worked, our docker did not. Schema migration
  in `db/database.ts` adds `cut_grass_height INTEGER`, `area INTEGER`,
  `timezone TEXT` to `cut_grass_plans` (idempotent ALTER TABLE).

## 2026-04-28 — Work records: field-name variants + sensor-cache fallback

- `routes/equipmentState.ts`: `POST /api/nova-data/equipmentState/saveCutGrassRecord`
  now accepts multiple naming variants per field (camelCase / snake_case /
  abbreviation) so it tolerates firmware-rev differences in mower POST
  bodies. When a field is missing entirely, falls back to the live
  `deviceCache` snapshot — `target_height + 2` for cutting height,
  `cov_area` / `cov_work_time` for size/duration, `current_map_ids` for
  mapNames, and `msg` parsed for workStatus. Records of interrupted
  sessions now show approximate context instead of an empty row.
- Diagnostic logging dumps every inbound body key at INFO so the next
  field-name mismatch surfaces in docker logs without needing wireshark.

## 2026-04-28 — Stock-app FCM token observation

- `routes/appUser.ts`: `POST /api/nova-user/appUser/updateAppUserMachineToken`
  now logs the FCM token prefix + IMEI tail at INFO when the stock
  Novabot v2.4.0 app uploads its registration. End-to-end delivery to
  the stock app still requires Novabot's APNS/FCM credentials we don't
  have — this is observation-only. Existing JWT auth + DB write
  unchanged.

## 2026-04-27 — Work records: parse mower multipart body

- `routes/equipmentState.ts`: `POST /api/nova-data/equipmentState/saveCutGrassRecord`
  now uses `multer.none()` to parse the mower's multipart/form-data body.
  Numeric fields are coerced (workTime, workArea, cutGrassHeight); list
  fields (mapNames, week) are JSON-stringified before insert. Previously
  every record was silently discarded as "lege body", masking a fully
  wired DB pipeline. App's `queryCutGrassRecordPageByUserId` will now
  return real rows once a mowing session completes.

## 2026-04-23 — Regression tests vs LFI fixtures + live dual-call

- `__tests__/contract/regression.lfi-fixtures.test.ts`: for every hot
  endpoint, load `fixtures/<name>.lfi.json` (captured from real LFI
  cloud via `scripts/capture-lfi-fixtures.mjs`), assert the fixture
  itself parses against our Zod schema, assert our server response
  parses against the same schema, and assert server response keys are
  a SUPERSET of LFI's (no dropped fields; extras allowed). Tests are
  auto-skipped if the fixture is missing so CI stays green without
  LFI credentials.
- `__tests__/contract/live.lfi-dual-call.test.ts`: env-gated live
  sanity check. `RUN_LIVE_LFI=1 LFI_EMAIL=… LFI_PASSWORD=…` runs a
  login + userEquipmentList + getEquipmentBySN(mower+charger) +
  queryEquipmentMap + checkOtaNewVersion against the real cloud and
  validates each response against our schema. Skipped by default.
- Added `.github/workflows/server-test.yml`: CI runs tsc + scoped
  ESLint + `npm test` on every push touching `server/**`.

## 2026-04-23 — Contract test: login

- `appUserDto.ts` schema `loginResponseSchema`; JWT presence + wrong-pw
  failure mode asserted. Also locks: `appUserId` is integer (row PK, not
  UUID), empty-string defaults for unset profile fields, HTTP 200 on
  failure (envelope-level `success:false`/`code:400`), and `/user` vs
  `/appUser` route alias parity. Plaintext passwords accepted because the
  handler's `tryDecryptAppPassword` falls back to raw on non-AES input;
  no network call needed (cloud fallback only fires when local user is
  missing, and `seedUser` seeds locally).

## 2026-04-23 — Contract test: checkOtaNewVersion

- `otaDto.ts` schema; `upgradeFlag ∈ {0,1}` asserted; `http://` URL
  enforced per CLAUDE.md OTA rules (https is explicitly rejected).

## 2026-04-23 — Contract test: queryEquipmentMap

- `mapDto.ts` with Zod schema for the response; md5-is-uppercase/null
  assertion; null-data path tested; IDOR null-payload parity tested.

## 2026-04-23 — Contract test: getEquipmentBySN

- Zod schema `getEquipmentBySnResponseSchema`; charger vs mower shape
  verified; LoRa defaults (718/16) asserted.

## 2026-04-23 — Contract test: userEquipmentList

- Zod schema `userEquipmentListResponseSchema` + 3 contract tests:
  shape, critical field values (chargerAddress 718, chargerChannel 16,
  account/password for charger, nullable for mower), is_active filter.
- `vitest.config.ts` now also includes `src/cloud-api/__tests__/**/*.test.ts`
  so contract tests under the cloud-api tree are picked up.

## 2026-04-23 — Contract-test harness

- Add `cloud-api/__tests__/testHarness.ts`: express app factory (no MQTT/socket),
  user + equipment seeders, JWT signer. Enables per-endpoint contract tests.

## 2026-04-23 — Route move (phase 3)

- Physical move of nova-user, nova-data, nova-file-server, nova-network,
  novabot-message routes into `cloud-api/routes/`. External URLs unchanged;
  internal imports rewritten to stay inside `cloud-api/*`, `db/`, `mqtt/`,
  `types/`, `middleware/`.
- `rowToCloudDto` now lives only in `cloud-api/serializers/equipmentDto.ts`;
  local copy in `nova-user/equipment.ts` removed.
- `callLfiCloud` / `encryptCloudPassword` (plus `makeLfiHeaders`,
  `LFI_CLOUD_HOST`, `LFI_CLOUD_SERVERNAME`) extracted from `routes/setup.ts`
  into `services/lfiCloud.ts` so the moved `appUser.ts` can import them
  without reaching into `routes/setup*` (forbidden by the cloud-api freeze
  ESLint rule). `routes/setup.ts` still re-exports `callLfiCloud` and
  `encryptCloudPassword` for backward-compat.
- No response-shape change.

## 2026-04-23 — Serializer + helpers move (step 1/2)

- Add `cloud-api/serializers/equipmentDto.ts` with Zod schema +
  `rowToCloudDto` mirroring the existing `nova-user/equipment.ts` impl.
  Explicit field picks; no spread operators.
- Add `cloud-api/helpers/response.ts` (`ok`/`fail`) and
  `cloud-api/helpers/lookupMac.ts` as private copies. Old versions remain in
  place; Task 9 will switch route imports over.
- No wire-level change.

## 2026-04-23 — CODEOWNERS for cloud-api

- Add `.github/CODEOWNERS` requiring @rvbcrs review on cloud-api paths.

## 2026-04-23 — Add CHANGELOG pre-commit guard

- Add `server/scripts/check-cloud-api-changelog.sh` and wire into `.husky/pre-commit`.
- Pre-commit also runs scoped ESLint on cloud-api + dashboard/admin/setup (boundary zone).
- No runtime behaviour change.

## 2026-04-23 — Initial scaffold

- Created `cloud-api/` tree with README and empty `mountCloudApi`. No runtime
  behaviour change; routes still mounted from their original locations.
