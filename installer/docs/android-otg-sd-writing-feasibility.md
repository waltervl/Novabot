# Writing a Raspberry Pi `.img` to an SD card from an Android phone over USB‑OTG — Feasibility (June 2026)

> Scope: can a non‑technical OpenNova mower owner take **phone + USB SD‑card reader + our app** and end up with a **correctly patched, bootable OpenNova SD card**, with **no root**? This document is the research answer, grounded against the existing Electron installer pipeline in `installer/src/main/` and verified against current (2026) upstream sources.

## TL;DR (5 lines)

1. **Yes — it works without root** on stock Android via the **USB Host API + a userspace USB Mass Storage / Bulk‑Only‑Transport SCSI driver**. This is exactly what **EtchDroid** does, on top of **libaums** (`me.jahnen.libaums:core` + `libusbcommunication`). Verified in EtchDroid's own source.
2. Raw `/dev/block` access is **root‑only** (SELinux MAC); but USB‑host bulk transfers are a *normal app capability* — that's the loophole the whole approach rides on.
3. **EtchDroid and libaums are both alive in 2026** (EtchDroid pushed 2026‑06‑05, 3.2k★, GPL‑3.0; libaums pushed 2025‑06, 1.36k★, Apache‑2.0). Neither is archived.
4. The hard parts are **OEM/reader compatibility** (some Samsung/Huawei/OnePlus phones block USB‑mass‑storage host mode; UASP‑only or exotic readers can fail) and **keeping the write alive in the foreground** — not the imaging itself.
5. **Lowest‑effort path: ship a per‑user‑prepatched `.img` and tell users to flash it with EtchDroid.** **Best‑experience path: a Kotlin platform‑channel in our existing Flutter app wrapping libaums (Apache‑2.0), reusing our image‑download/verify/patch logic.**

---

## 1. Can it be done without root on modern Android (14/15/16)? Mechanism.

**Yes, confirmed — your understanding is essentially correct.** The mechanism is the **Android USB Host API** (`android.hardware.usb.*`) driving a **userspace USB Mass Storage class driver** that speaks **Bulk‑Only Transport (BOT)** and the **SCSI command set** (`INQUIRY`, `READ CAPACITY`, `READ(10)`, `WRITE(10)`) over USB bulk endpoints. The SD card reader appears to the phone as a USB Mass Storage device; the app claims its interface and issues SCSI `WRITE(10)` commands carrying 512‑byte‑aligned sectors of the image. No kernel block device is involved on the phone side.

This is exactly what **EtchDroid** ("write OS images to USB drives, on Android, no root required") does, and it does it on top of **libaums** — confirmed directly in EtchDroid's dependency manifest and source:

- `gradle/libs.versions.toml`: `libaums-core = { group = "me.jahnen.libaums", name = "core", version "0.10.0" }` and `libaums-libusbcommunication` ([EtchDroid repo](https://github.com/EtchDroid/EtchDroid)).
- `app/src/main/java/eu/depau/etchdroid/massstorage/EtchDroidUsbMassStorageDevice.kt` imports `me.jahnen.libaums.core.UsbMassStorageDevice`, `me.jahnen.libaums.core.driver.BlockDeviceDriver`, `BlockDeviceDriverFactory`, and `me.jahnen.libaums.libusbcommunication.LibusbCommunicationCreator`.
- It writes the raw image through a custom `BlockDeviceOutputStream` that talks to libaums' **`BlockDeviceDriver`** (`blockDev.blockSize`, `blockDev.blocks`, sector‑addressed writes) — i.e. **dd‑style whole‑disk imaging via SCSI WRITE, not the FAT file API**.

So: **USB Host API + libaums BOT/SCSI driver = EtchDroid's no‑root imaging.** Confirmed, not corrected.

### Why raw `/dev/block` is NOT available to unrooted apps, but USB‑host bulk transfers ARE

- **`/dev/block/*` is locked down by Android's SELinux Mandatory Access Control.** Since Android 5.0 SELinux is fully enforcing across all domains; an ordinary app's domain (`untrusted_app`) has **no policy allow rule** to open block device nodes. Even *with* root, SELinux still gates which domains may touch block devices ([SELinux in Android, AOSP](https://source.android.com/docs/security/features/selinux); [SELinux concepts](https://source.android.com/docs/security/features/selinux/concepts)). Writing a raw block device is, in general, a root‑plus‑permissive‑SELinux operation.
- **USB Host bulk transfers are an explicit, sanctioned app capability.** The `UsbManager`/`UsbDeviceConnection.bulkTransfer()` path is designed for normal apps; it requires only a **per‑device runtime permission grant** (a user dialog), available since **API 12** with USB host mode on **Android 3.1+** ([USB host overview, Android Developers](https://developer.android.com/develop/connectivity/usb/host)). No root, no manifest dangerous permission, no SELinux exception.

That asymmetry is the entire reason this works: the phone never writes its own block device — it sends SCSI commands *out the USB port* to a foreign mass‑storage device, which is firmly inside the app sandbox's allowed surface.

---

## 2. Is EtchDroid maintained in 2026? What's under the hood? libaums status, forks, license.

**EtchDroid — actively maintained, NOT archived.**
- Repo: **`EtchDroid/EtchDroid`** (note the capitalised org; the old lowercase `etchdroid/etchdroid` redirects). **3,202 stars, GPL‑3.0, Kotlin, last push 2026‑06‑05, `isArchived: false`** (verified via GitHub API, 2026‑06‑10).
- ⚠️ **Pitfall:** the GitHub *Releases* tab shows "Last release with DMG support" dated **2023‑02‑26** (`dmg-support` tag). That is **not** the project's age — it's the last release that still bundled Apple‑DMG support. Development continues on `main` (recent commits May 2026); distribution is via **F‑Droid / Google Play**, not GitHub release tags. Don't be misled by the stale releases tab.
- Under the hood: **Kotlin**, libaums for USB mass storage, a foreground `WorkerService` for the write, custom `BlockDeviceInputStream`/`BlockDeviceOutputStream`, image verification after write. **GPL‑3.0** (so we can read/learn from it but **cannot statically link its code into a closed/Play‑Store‑proprietary app without going GPL ourselves** — relevant if we copy code rather than reimplement).

**libaums — actively maintained, Apache‑2.0 (permissive).**
- Repo: **`magnusja/libaums`** (Magnus Jahnen). **1,358 stars, Apache‑2.0, last push 2025‑06‑12.** Recent commits in 2025 fix real bugs (SCSI sense‑data buffer overflow `#432`, recoverable unit‑attention handling `#431`). `isArchived: false`.
- Maven coordinates: `me.jahnen.libaums:core` and `me.jahnen.libaums:libusbcommunication`. Implements the **SCSI command set (`READ(10)`, `WRITE(10)`, `INQUIRY`, `READ CAPACITY`) and a FAT32 filesystem layer** ([libaums README](https://github.com/magnusja/libaums)).
- **License nuance:** core is **Apache‑2.0** (fine to use in a proprietary app). The optional **`libusbcommunication`** module embeds **libusb (LGPL)**. EtchDroid uses `LibusbCommunicationCreator` (libusb backend). libaums *also* ships a pure‑Android‑USB‑API communication backend, so **we can avoid the LGPL module entirely** and stay fully Apache‑2.0 if we use the Android‑API `UsbCommunication` instead of libusb.
- **Forks:** the once‑relevant **`depau-forks/libaums`** is **stale (last commit 2020)** — EtchDroid no longer needs it; it consumes the upstream `me.jahnen.libaums` artifacts. Other forks (`nicolausYes`, `zx-github`, `vfishv`) exist but upstream is the live one.

**Bottom line for reuse:** we can **link libaums directly under Apache‑2.0** (avoiding the libusb/LGPL module), and treat **EtchDroid (GPL‑3.0) as a reference implementation** for the tricky bits (block stream buffering, error recovery, OEM handling) without copying its code.

---

## 3. Reader / adapter compatibility

**Most consumer USB SD readers enumerate as USB Mass Storage / BOT and work with libaums.** But there are concrete failure classes — this is the single biggest practical risk.

- **BOT vs UASP.** libaums implements **Bulk‑Only Transport (BOT)** + SCSI. **UASP (USB Attached SCSI)** is a different, USB‑3 streaming/queued protocol. UASP only engages when the *whole stack* supports it; otherwise the device **falls back to BOT** for compatibility ([UASP vs BOT, Electronic Design](https://www.electronicdesign.com/technologies/embedded/article/21800348/whats-the-difference-between-usb-uasp-and-bot); [getUSB](https://www.getusb.info/why-some-usb-devices-use-bot-while-others-use-uasp/)). The good news: most cheap SD readers are **BOT‑only or BOT‑capable**. The risk: a **strictly UASP‑only** reader, or one that mis‑negotiates, may not present a BOT interface libaums can claim. We cannot guarantee every reader; we should **publish a known‑good list** and/or sell/recommend a specific reader.
- **Filesystem‑parse failures are *not* transport failures.** In libaums [#310](https://github.com/magnusja/libaums/issues/310) a SanDisk Extreme 128 GB "150 MB/s" card "wasn't supported": logs show the device **was detected** (512‑byte blocks, `READ CAPACITY` + `INQUIRY` succeeded) and only the **FAT/partition parse** threw ("Unsupported fs on partition"). For *raw imaging* (dd‑style block writes) that parse step is irrelevant — we write sectors directly — so such cards are actually fine for our use; only libaums' FAT layer is FAT32‑only (no exFAT).
- **Won't‑work classes (from EtchDroid's own support matrix):** USB **hubs and docks**, **USB hard drives/SSDs**, **internal SD slots** (Android forbids raw writes to the built‑in slot — "Only USB devices can ever be supported"), **Thunderbolt‑only** devices, and **optical/floppy** ([EtchDroid README](https://github.com/EtchDroid/EtchDroid) / [FAQ](https://etchdroid.app/faq/)). A reader behind a hub is a common user mistake.
- **OEM / phone‑side blocks (the big one).** EtchDroid [#117](https://github.com/etchdroid/etchdroid/issues/117): **"Does not work on Samsung (OneUI ≥ 3.0, Android 11), some Huawei models, some OnePlus models."** The cause is a **phone‑side USB‑host / kernel limitation on those OEM builds** (it cross‑references libaums [#293](https://github.com/magnusja/libaums/issues/293)), not our code — some OEMs neuter USB‑mass‑storage *host* support. **Pixels and many phones work; a non‑trivial slice of Samsung/Huawei/OnePlus do not, and we can't fix that from userspace.**
- **USB‑C / OTG today.** Modern USB‑C phones generally don't need a separate "OTG" dongle for a USB‑C reader, but **USB‑A readers still need a USB‑C↔A OTG adapter**, and some budget phones don't enable host mode at all. Behaviour varies by phone.
- **Permission prompts.** Each physical device triggers a **per‑device runtime USB permission dialog**, and the grant is **lost on unplug/replug** — it must be re‑requested every connection ([USB host overview](https://developer.android.com/develop/connectivity/usb/host)). Using an `USB_DEVICE_ATTACHED` intent‑filter can auto‑grant on attach, smoothing the UX.

---

## 4. Android version changes over time (13/14/15/16): does anything break this?

- **The USB Host API itself is stable** and unchanged in substance across 13→16; bulk transfers + per‑device permission still work without root ([USB host overview](https://developer.android.com/develop/connectivity/usb/host)).
- **Scoped storage does NOT affect this.** Scoped storage governs the *filesystem* (`MediaStore`/SAF access to shared storage). **USB‑host bulk transfers are an entirely separate subsystem** and are unaffected — confirmed by the fact that EtchDroid keeps working on Android 14/15 while targeting modern SDKs.
- **The real Android‑version risk is background execution, not USB permission.** libaums [#278](https://github.com/magnusja/libaums/issues/278): USB transfers **fail when the app is backgrounded / screen off** (libusb errors −7/−9, device resets) even with a foreground service + wake lock; reproduced on Android 10 Pixel. Android 14/15 then **tighten foreground services further** — apps targeting **API 34+** must declare a typed FGS, and **API 35 (Android 15) caps `dataSync`/`mediaProcessing` foreground services to ~6 hours/day** and restricts launching them from the background ([Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-15); [FGS changes](https://developer.android.com/develop/background-work/services/fgs/changes)). For a one‑shot 2–6 minute image write this is *fine*, but it means: **run the write in a typed foreground service, hold a wake lock, and keep the screen on / app in foreground.** Don't architect it as a background job.
- **No new per‑app USB block** was introduced in 14/15/16. The blocks that exist are **OEM‑specific** (see §3, Samsung/Huawei/OnePlus). **Samsung Knox / managed‑device policies** can additionally disable USB host or mass storage on enterprise‑enrolled devices, but that doesn't affect normal consumer phones.

---

## 5. Performance: realistic write throughput

- **The bottleneck is the SD card + USB link, not the SCSI‑in‑userspace overhead.** Practically, expect **roughly 5–15 MB/s** on typical USB‑2 readers/phones, sometimes up to ~20–30 MB/s on good USB‑3 reader + fast card + capable phone. (Pi/USB‑2 ceilings ~30 MB/s in practice; cheap NAND often far less — see general SD/USB‑2 numbers, [Raspberry Pi forum](https://forums.raspberrypi.com/viewtopic.php?t=32454).) Hard public MB/s benchmarks for EtchDroid specifically are scarce, so treat these as engineering estimates, not measured guarantees.
- **A Raspberry Pi OS Lite arm64 image is ~3 GB decompressed.** At 8–12 MB/s that's **~5–7 minutes**; at 20 MB/s ~2.5 min; worst‑case slow card ~10–12 min. **Minutes, not hours.** Acceptable for a one‑time setup.
- **How EtchDroid keeps it fast (the technique to copy):** its `BlockDeviceOutputStream` uses a **background I/O worker thread** fed by a small queue, and a **large per‑transfer buffer — default `bufferBlocks = 512` → 512 × 512 B = 256 KiB per SCSI `WRITE(10)`**, with a 4‑deep pipeline (`queueSize = 4`). Bigger transfers amortise BOT command/status overhead; pipelining overlaps building the next buffer with the in‑flight write. This is the main lever. (Source: EtchDroid `massstorage/BlockDeviceOutputStream.kt`.)
- **UASP would help in theory** (queued, multi‑threaded) but libaums is **BOT‑only**, so the realistic speed‑ups are **(a) large buffers, (b) background pipelining** — both already demonstrated by EtchDroid — not switching to UASP.

---

## 6. The rest of our pipeline on Android (decompress + patch FAT)

Our Electron pipeline is: download `.img.xz` → SHA256 verify → **streaming xz decompress** (`xz-decompress`) → **patch FAT boot partition with mtools at a byte offset** (`imagePatcher.ts`) → raw write (`flashDisk.ts`, macOS `authopen`/`/dev/rdiskN`). On Android:

**xz streaming decompression — feasible.**
- Dart/Flutter: the **`archive`** package decodes xz (`XZDecoder`), and `package:archive/archive_io.dart` streams from a file to bound memory ([archive on pub.dev](https://pub.dev/packages/archive)); a pure‑Dart **`lzma`** package also exists.
- Kotlin/Java: **Apache Commons Compress** (`XZCompressorInputStream`) or **XZ for Java** (Tukaani) — battle‑tested, streaming. If we go native‑Kotlin we'd use these.
- Verdict: **decompress‑while‑writing is doable on‑device**; we can even pipe xz → block stream so we never store the full 3 GB `.img` on the phone (it only fits in the reader's card). This mirrors our existing streaming design.

**FAT32 boot‑partition patching — two strategies, and a clear winner.**

*Strategy A — pre‑patch the `.img`, then write verbatim (what our Electron tool already does).*
Read the MBR, find the first FAT partition's byte offset, write `firstrun.sh` + empty `ssh` sentinel + idempotent `cmdline.txt` append. On desktop we use **mtools** because — per the comment in `imagePatcher.ts` — a **pure‑JS FAT writer was evaluated and rejected: it produced an fsck‑dirty filesystem (leaked clusters on empty files)**, unacceptable for a flashing tool. **mtools is not available on stock Android.** So Strategy A on‑device means either (i) bundle a FAT writer we trust, or (ii) **do the patch off‑device** (see §7d).

*Strategy B — write the raw image first, then patch over libaums' FAT layer.*
After imaging, libaums can **re‑open the freshly written card, mount partition 0 as FAT32, and create/append files** (`device.partitions[0].fileSystem.rootDirectory.createFile("firstrun.sh")`, `UsbFileOutputStream`; `createDirectory`/`createFile` per [libaums README](https://github.com/magnusja/libaums)). This needs **no mtools** and reuses the *same* USB/SCSI session. **Caveat:** libaums' FAT32 writer carries the *exact* fsck‑cleanliness risk our Electron code already hit with a JS FAT writer — and libaums' own bug history (e.g. cluster/length handling; README explicitly warns to `setLength()` before writing or the cluster chain grows per‑write). For tiny files (`firstrun.sh`, `ssh`, a one‑line `cmdline.txt`) the risk is low and the Pi's first‑boot `fsck`/`resize` is forgiving, but it must be tested. The reusable, portable, *pure* piece is our **MBR parser** (`readBootPartitionOffset` in `imagePatcher.ts`) and the **`generateFiles(config)` content** (firstrun.sh + cmdline token) — both translate to Dart/Kotlin verbatim.

**Recommendation:** prefer **Strategy A done off‑device** (pre‑patched image; §7d) for the low‑effort path, and **Strategy B (write‑then‑patch via libaums FAT)** for the in‑app path — it avoids shipping a FAT writer and keeps one USB session, accepting that we must verify fsck‑cleanliness on real cards.

---

## 7. Delivery options, ranked

Reusable from today's pipeline regardless of vehicle: **image URL resolution + SHA256 verify** (`imageSource.ts`), **xz streaming** (concept), **MBR offset parse** (`imagePatcher.ts` `readBootPartitionOffset`), and **first‑boot file generation** (`configModel.ts` `generateFiles` → `firstrun.sh`, `ssh`, `cmdline` append, used by both `imagePatcher.ts` and `bootInject.ts`). The **only** genuinely new code for Android is the **USB‑host + SCSI block write** (libaums) and possibly the FAT write‑back.

**(d) Pre‑patched image + EtchDroid — LOWEST EFFORT, recommended starting point.**
We patch the `.img` per‑user in our **Electron tool or on our server** (we already have `patchImageBootPartition`), export a ready‑to‑flash **`opennova-<user>.img`**, and the user flashes it verbatim with **EtchDroid** (no compression — EtchDroid requires images "unzipped first", so export `.img`, not `.img.xz`; or `.gz`/`.zip` which EtchDroid does accept, but plain `.img` is safest).
- *Per‑user wifi/hostname:* **fully solved by pre‑patching** — that's literally what `imagePatcher.ts` does. The phone writes bytes verbatim; no on‑device patching needed. ✔️
- *Root:* none. *USB code of ours:* none. *Play Store:* not our concern (EtchDroid is on Play/F‑Droid).
- *Cons:* second app to install; ~3 GB transfer to the phone; we must host/generate per‑user images (size/bandwidth) or have the Electron tool emit the `.img` for the user to copy to the phone; UX is two tools, not one. Reuses **~100%** of our pipeline (download/verify/patch) with **zero** new mobile code.
- **Effort: ~days.**

**(a) Feature inside our existing Flutter app via a Kotlin platform channel wrapping libaums — BEST EXPERIENCE, recommended target.**
A `MethodChannel`/`EventChannel` to Kotlin that: enumerates USB mass‑storage devices, requests the per‑device permission, opens libaums `BlockDeviceDriver`, and streams **xz→SCSI WRITE(10)** with EtchDroid's buffering technique; then patches via libaums FAT (Strategy B) or writes a pre‑patched image (Strategy A). UI, progress, and Dart‑side download/verify reuse our logic.
- *Root:* none. *License:* link **libaums core under Apache‑2.0** (skip the LGPL libusb module by using the Android‑USB‑API `UsbCommunication` backend); use EtchDroid (GPL‑3.0) only as a *reference*, don't copy its code into a proprietary app.
- *Play Store:* viable — USB host + (typed) foreground service are allowed; no special storage permission needed (it's USB‑host, not scoped storage). Declare the FGS type and the `USB_DEVICE_ATTACHED` intent‑filter.
- *Note:* **no existing Flutter plugin does this.** `flutter_usb_write`/`another_flutter_usb_write` are for **POS printers — raw bulk to one OUT endpoint, no SCSI, no mass storage** ([flutter_usb_write](https://github.com/oscarfv/flutter_usb_write)). So the Kotlin channel is genuinely custom (it's a thin wrapper over libaums, though).
- *Cons:* must own the OEM/reader edge cases (§3) and the foreground‑service write lifecycle (§4); Android‑only (the Flutter app's iOS side can't offer it — see §8).
- **Effort: ~1–2 weeks** for a solid first version (the imaging core is small because libaums does the heavy lifting; most effort is permission/lifecycle/error‑UX and device testing).

**(b) Separate native Kotlin app.** Same capability as (a) with the cleanest native control and the option to be **GPL‑3.0 and fork EtchDroid directly** (huge head start — it already handles devices, permissions, FGS, verification). But it's **a second app to ship/maintain**, duplicates our download/verify/patch logic, and a fork inherits GPL‑3.0. Effort: ~1 week if forking EtchDroid; more from scratch. Only pick this if we *want* to copy EtchDroid code (then we accept GPL‑3.0).

**(c) React Native / Capacitor.** No mature RN/Capacitor USB‑mass‑storage plugin exists; you'd still write the **same Kotlin/libaums native module**, just bridged to JS instead of Dart — and our app is already Flutter. **No advantage; skip.**

---

## 8. iOS reality check

**Effectively blocked.** iOS/iPadOS expose USB‑C card readers only through the **Files app / `UIDocumentPicker` at the *filesystem* level** (read/write files on a mounted FAT/exFAT volume) — there is **no public API for raw block‑device access** to a USB mass‑storage device, and no sanctioned USB‑mass‑storage host stack for third‑party apps (no libaums equivalent; `IOUSBHost`/DriverKit are for macOS, not iOS apps). So an EtchDroid‑style "write a raw `.img` to the card" app **cannot exist on the App Store**. The cross‑platform story is therefore: **Android phone can image the card in‑app; an iPhone/iPad user must use a computer** (our Electron installer / Raspberry Pi Imager) — or, at best, we'd have to ship the SD pre‑imaged and let iOS only *edit config files* on the already‑bootable card via Files (a much narrower, fragile flow). Treat iOS as **out of scope** for on‑device imaging. ([Apple Support community on Files + SD readers](https://discussions.apple.com/thread/253280742) — filesystem‑level only.)

---

## 9. Bottom line — recommendations

**Lowest‑effort path (ship this first):**
**Pre‑patch in our existing tooling, flash with EtchDroid.** Keep `patchImageBootPartition` exactly as is, add an **"export ready‑to‑flash image"** output to the Electron tool (and/or a per‑user image endpoint on the server), hand the user a plain **`opennova-<user>.img`**, and instruct: *install EtchDroid (Play/F‑Droid) → plug in USB SD reader → pick the image → flash.* Per‑user wifi/hostname is already baked into the image, so the phone writes verbatim — **zero new mobile code, ~100% pipeline reuse, no root, no Play‑Store work of ours.** This validates the OTG/reader reality with users at near‑zero cost.

**Best‑experience path (invest if validation is positive):**
**One‑tap imaging inside our Flutter app** via a **Kotlin platform channel wrapping libaums (Apache‑2.0 core, Android‑USB backend — no LGPL)**. Reuse Dart‑side download + SHA256 + xz streaming and the MBR/first‑boot generators; do the raw write with EtchDroid's proven buffered `BlockDeviceOutputStream` pattern in a **typed foreground service with the screen kept on**; patch via libaums' FAT layer after imaging (write‑then‑patch) to avoid bundling mtools. Single app, single flow, no second download. Use EtchDroid's GPL‑3.0 source only as a *reference* for the gnarly bits, not as copied code.

### Top 3 risks / caveats
1. **OEM phone‑side blocks (highest risk, unfixable from userspace).** Some **Samsung (OneUI ≥ 3.0), Huawei, OnePlus** builds disable USB‑mass‑storage host mode → the app simply can't see the reader (EtchDroid [#117](https://github.com/etchdroid/etchdroid/issues/117)). We cannot guarantee "any Android phone." Mitigate: detect & message clearly, publish a known‑good phone/reader list, and **always keep path (d)/desktop as the fallback.**
2. **Reader/card variability.** UASP‑only or off‑brand readers, hubs, and exFAT/exotic‑FS cards can fail to enumerate or parse (libaums BOT‑only + FAT32‑only; [#310](https://github.com/magnusja/libaums/issues/310), [FAQ](https://etchdroid.app/faq/)). Mitigate: recommend/sell a specific BOT reader; for raw imaging, prefer Strategy‑A pre‑patched images so the FAT‑parse limitation is irrelevant.
3. **Foreground‑lifecycle fragility + verification.** USB transfers die if the app is backgrounded/screen‑off (libaums [#278](https://github.com/magnusja/libaums/issues/278)); Android 14/15 FGS rules require a typed service and limit background starts. And **always verify after write** (read‑back hash, like EtchDroid) — a silently corrupt card is worse than an obvious failure. None of these are blockers, but they're the difference between "demo works" and "non‑technical user succeeds unattended."

> Honest uncertainty: precise **MB/s** for EtchDroid/libaums on specific 2026 phones is not well documented publicly — §5 numbers are sound engineering estimates, not measured guarantees; benchmark on the target phone/reader before quoting users a time. The OEM‑block list (§3/§1) is from EtchDroid issues spanning Android 11+; exact behaviour on the very latest 2026 Samsung/Pixel firmware should be confirmed on real hardware.

---

### Sources
- EtchDroid: https://github.com/EtchDroid/EtchDroid · https://etchdroid.app/ · FAQ https://etchdroid.app/faq/ · issue #117 https://github.com/etchdroid/etchdroid/issues/117
- libaums: https://github.com/magnusja/libaums · issues #278 https://github.com/magnusja/libaums/issues/278 · #310 https://github.com/magnusja/libaums/issues/310 · #293 (referenced by EtchDroid #117)
- Android USB Host API: https://developer.android.com/develop/connectivity/usb/host
- Android SELinux (why /dev/block is root‑only): https://source.android.com/docs/security/features/selinux · https://source.android.com/docs/security/features/selinux/concepts
- Android 15 behavior / foreground services: https://developer.android.com/about/versions/15/behavior-changes-15 · https://developer.android.com/develop/background-work/services/fgs/changes
- UASP vs BOT: https://www.electronicdesign.com/technologies/embedded/article/21800348/whats-the-difference-between-usb-uasp-and-bot · https://www.getusb.info/why-some-usb-devices-use-bot-while-others-use-uasp/
- Dart/Flutter xz: https://pub.dev/packages/archive
- Flutter USB plugins (printer‑only, NOT mass storage): https://github.com/oscarfv/flutter_usb_write
- iOS Files + SD readers (filesystem‑level only): https://discussions.apple.com/thread/253280742
- Our pipeline: `installer/src/main/imageSource.ts`, `imagePatcher.ts`, `bootInject.ts`, `flashDisk.ts`, `configModel.ts`
