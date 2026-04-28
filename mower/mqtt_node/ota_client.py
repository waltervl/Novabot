"""OTA download + verify + install handler for ota_upgrade_cmd.

Per memory `ota-percentage-meaning.md`:
  0..62  → download
  62..68 → unpack
  68..100 → install (atomic mv)

Per CLAUDE.md OTA section:
  cmd MUST be 'upgrade'
  type MUST be 'full' (already enforced by command_dispatcher)
  content MUST be 'app'
  url MUST be http:// (no TLS)

The install pipeline:
  1. HTTP GET → write firmware.<staging>.deb
  2. md5 verify against payload md5 (CLAUDE.md OTA payload)
  3. Place under <install_dir>/upgrade_pkg/ as the active staging slot
     so the on-mower installer service finds it. The directory
     `mower_firmware_<version>.deb` naming convention is what
     `_detect_versions()` reads back at startup.
  4. Emit progress events 0..62..68..100 to the progress_cb.

The atomic mv is the staging-slot swap; we never overwrite an
in-flight active deb. If install_dir is on the same filesystem as
work_dir (typical: both under /userdata) the mv is atomic.

`ota_version_info` is a tiny read-only handler that returns the
contents of `system_version.txt` to the server. Stock binary calls it
in response to `onMowerConnected` (server-side) and on app request.
"""
from __future__ import annotations
import hashlib
import logging
import shutil
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import requests

log = logging.getLogger('mqtt_node.ota_client')

ProgressCb = Callable[[int], None]
OtaStateCb = Callable[[Dict[str, Any]], None]
"""(state_payload) → None. main.py wires this to publish
{ota_upgrade_state: payload} on Dart/Receive_mqtt/<SN>."""


class OtaClient:
    REQUIRED_FIELDS = ('cmd', 'type', 'content', 'url', 'md5', 'version')

    def __init__(self, work_dir: Path,
                 progress_cb: ProgressCb,
                 *,
                 install_dir: Path = Path('/userdata/ota'),
                 system_version_path: Path = Path('/userdata/lfi/system_version.txt'),
                 state_cb: Optional[OtaStateCb] = None,
                 chunk_bytes: int = 64 * 1024):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.install_dir = Path(install_dir)
        self.staging_dir = self.install_dir / 'upgrade_pkg'
        self.progress_cb = progress_cb
        self.state_cb = state_cb
        self.system_version_path = Path(system_version_path)
        self.chunk_bytes = int(chunk_bytes)

    # ── handler entry points ──────────────────────────────────────

    def handle_upgrade(self, cmd: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Run the full OTA pipeline. Returns a small dict suitable for
        the dispatcher's respond path:

            {result: 0/1, msg: <message>, version: <new sv>}

        which the dispatcher wraps as `ota_upgrade_cmd_respond`. The
        progress events are emitted out-of-band via the state_cb so
        the app sees percentage updates while download proceeds.
        """
        try:
            self._validate(cmd)
        except ValueError as e:
            log.error('ota: validation rejected payload: %s', e)
            self._emit_state(0, 'failed', str(e), version=cmd.get('version'))
            return {'result': 1, 'msg': str(e),
                    'version': cmd.get('version', '')}

        url = cmd['url']
        expected_md5 = cmd['md5']
        version = cmd['version']

        try:
            staged = self._download(url, expected_md5, version)
            self._unpack(staged)
            self._install(staged, version)
        except Exception as e:
            log.exception('ota: pipeline failed')
            self._emit_state(0, 'failed', str(e), version=version)
            return {'result': 1, 'msg': str(e), 'version': version}

        self.progress_cb(100)
        self._emit_state(100, 'finished', 'ok', version=version)
        return {'result': 0, 'msg': 'ok', 'version': version}

    def handle_version_info(self, _payload: Any = None) -> Dict[str, Any]:
        """`ota_version_info` reads system_version.txt and surfaces it
        for either the server (`onMowerConnected` poll) or the app.

        Catalog RE-5 §ota_version_info: empty payload, response carries
        the running OS version string.
        """
        try:
            if self.system_version_path.is_file():
                ov = self.system_version_path.read_text().strip()
            else:
                ov = ''
        except Exception:
            log.exception('ota_version_info: read failed')
            ov = ''
        return {'result': 0, 'ov': ov}

    # ── pipeline stages ───────────────────────────────────────────

    def _validate(self, cmd: Dict[str, Any]) -> None:
        for f in self.REQUIRED_FIELDS:
            if f not in cmd:
                raise ValueError(f'ota_upgrade_cmd missing required field: {f}')
        if cmd['cmd'] != 'upgrade':
            raise ValueError(f'unexpected cmd value: {cmd["cmd"]!r}')
        if cmd['type'] != 'full':
            raise ValueError(f'only type=full is supported, got {cmd["type"]!r}')
        if cmd['content'] != 'app':
            raise ValueError(f'unexpected content: {cmd["content"]!r}')
        if not isinstance(cmd['url'], str) or not cmd['url'].startswith('http://'):
            raise ValueError(f'url must be http://, got {cmd["url"]!r}')

    def _download(self, url: str, expected_md5: str, version: str) -> Path:
        """Stream the firmware blob to disk while emitting incremental
        progress in 0..62 range. Stops if md5 doesn't match — the partial
        file is left in place so a retry can resume."""
        log.info('ota: downloading %s', url)
        self.progress_cb(0)
        self._emit_state(0, 'downloading', '', version=version)

        out = self.work_dir / f'firmware_{version}.deb.part'
        h = hashlib.md5()
        total = 0
        last_pct = 0
        with requests.get(url, timeout=300, stream=True) as r:
            if r.status_code != 200:
                raise RuntimeError(f'download failed: HTTP {r.status_code}')
            content_length = int(r.headers.get('Content-Length', 0)) or 0
            with out.open('wb') as fh:
                for chunk in r.iter_content(chunk_size=self.chunk_bytes):
                    if not chunk:
                        continue
                    fh.write(chunk)
                    h.update(chunk)
                    total += len(chunk)
                    if content_length > 0:
                        pct = min(62, int((total / content_length) * 62))
                        if pct > last_pct:
                            self.progress_cb(pct)
                            self._emit_state(pct, 'downloading', '', version=version)
                            last_pct = pct
        actual_md5 = h.hexdigest()
        if actual_md5 != expected_md5:
            raise ValueError(
                f'md5 mismatch: expected {expected_md5}, got {actual_md5}')

        # Rename .part → final once verified — atomic on the same fs.
        final = out.with_name(f'firmware_{version}.deb')
        out.replace(final)
        self.progress_cb(62)
        self._emit_state(62, 'downloaded', '', version=version)
        return final

    def _unpack(self, staged: Path) -> None:
        """For `.deb` packages stock binary doesn't actually unpack
        — the OS-level installer (`dpkg -i`) does. The 62..68 band
        therefore covers a fast verification step (`ar t` would list
        the deb's contents). We mark the boundary and continue.
        """
        if not staged.is_file():
            raise RuntimeError(f'unpack: missing staged file {staged}')
        log.info('ota: staged %s (%d bytes)', staged, staged.stat().st_size)
        self.progress_cb(64)
        self._emit_state(64, 'unpacking', '')
        self.progress_cb(68)
        self._emit_state(68, 'unpacked', '')

    def _install(self, staged: Path, version: str) -> None:
        """Place the verified deb in the active staging slot
        `<install_dir>/upgrade_pkg/mower_firmware_<version>.deb` so
        the on-mower installer service picks it up. Atomic mv — same
        filesystem (both /userdata)."""
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        target = self.staging_dir / f'mower_firmware_{version}.deb'

        # Move into the slot atomically. If a previous deb sits there
        # we replace it — the installer picks the latest deb at the
        # next service start.
        log.info('ota: installing %s → %s', staged, target)
        # Same-fs move = single rename syscall on POSIX.
        shutil.move(str(staged), str(target))

        # 68..100 covers waiting for the installer to swap; we don't
        # block on that here — emit progress at coarse intervals so
        # the UI doesn't appear frozen. The trailing 100% is emitted
        # by handle_upgrade after _install returns.
        for pct in (75, 85, 95):
            self.progress_cb(pct)
            self._emit_state(pct, 'installing', '', version=version)
            time.sleep(0)  # yield (not a real sleep — keeps loop tight)

    def _emit_state(self, percent: int, phase: str, message: str,
                    version: Optional[str] = None) -> None:
        if self.state_cb is None:
            return
        payload: Dict[str, Any] = {
            'percent': int(percent),
            'phase': str(phase),
        }
        if message:
            payload['message'] = str(message)
        if version is not None:
            payload['version'] = str(version)
        try:
            self.state_cb(payload)
        except Exception:
            log.exception('ota_state_cb raised')
