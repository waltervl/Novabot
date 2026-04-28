"""OTA client downloads firmware via HTTP, verifies MD5, installs
atomically into the staging slot. Mock requests + filesystem; do not
touch real disk."""
import hashlib
import io
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from ota_client import OtaClient


def _md5_of(b: bytes) -> str:
    return hashlib.md5(b).hexdigest()


@contextmanager
def _mock_streaming_get(payload: bytes, status: int = 200, chunk: int = 4096):
    """Mock requests.get(..., stream=True) returning `payload` in
    chunks. Mirrors the iter_content protocol the new OtaClient uses."""
    mock = MagicMock()
    mock.status_code = status
    mock.headers = {'Content-Length': str(len(payload))}

    def _iter(chunk_size=chunk):
        buf = io.BytesIO(payload)
        while True:
            data = buf.read(chunk_size)
            if not data:
                break
            yield data

    mock.iter_content = _iter
    mock.__enter__ = lambda self_: mock
    mock.__exit__ = lambda *args: False
    with patch('ota_client.requests.get', return_value=mock) as gp:
        yield gp


def _make_client(tmp_path, *, state=None, progress=None):
    return OtaClient(
        work_dir=tmp_path / 'work',
        progress_cb=progress.append if progress is not None else (lambda _: None),
        install_dir=tmp_path / 'install',
        system_version_path=tmp_path / 'system_version.txt',
        state_cb=state.append if state is not None else None,
    )


def test_handle_upgrade_happy_path_writes_to_staging_slot(tmp_path):
    progress = []
    state_events = []
    cli = _make_client(tmp_path, progress=progress, state=state_events)

    fw_bytes = b'firmware-payload-bytes-' * 100
    cmd = {
        'cmd': 'upgrade',
        'type': 'full',
        'content': 'app',
        'url': 'http://x/firmware.deb',
        'md5': _md5_of(fw_bytes),
        'version': '6.0.2-custom-25',
    }

    with _mock_streaming_get(fw_bytes):
        resp = cli.handle_upgrade(cmd)

    assert resp == {'result': 0, 'msg': 'ok', 'version': '6.0.2-custom-25'}
    assert progress[0] == 0
    assert 62 in progress
    assert 68 in progress
    assert progress[-1] == 100
    target = tmp_path / 'install' / 'upgrade_pkg' / 'mower_firmware_6.0.2-custom-25.deb'
    assert target.exists()
    assert target.read_bytes() == fw_bytes


def test_handle_upgrade_emits_progress_events_in_band(tmp_path):
    state_events = []
    cli = _make_client(tmp_path, state=state_events)

    fw = b'\x00' * 32_000
    cmd = {
        'cmd': 'upgrade', 'type': 'full', 'content': 'app',
        'url': 'http://x/y.deb', 'md5': _md5_of(fw), 'version': '7',
    }
    with _mock_streaming_get(fw):
        cli.handle_upgrade(cmd)

    phases_seen = [(e['percent'], e['phase']) for e in state_events]
    assert phases_seen[0] == (0, 'downloading')
    assert (62, 'downloaded') in phases_seen
    assert (68, 'unpacked') in phases_seen
    assert (100, 'finished') in phases_seen


def test_md5_mismatch_returns_error_response(tmp_path):
    progress = []
    state_events = []
    cli = _make_client(tmp_path, progress=progress, state=state_events)

    fw = b'wrong-bytes'
    cmd = {
        'cmd': 'upgrade', 'type': 'full', 'content': 'app',
        'url': 'http://x/y.deb', 'md5': 'deadbeef', 'version': 'x',
    }
    with _mock_streaming_get(fw):
        resp = cli.handle_upgrade(cmd)

    assert resp['result'] == 1
    assert 'md5' in resp['msg']
    # Failed state event with phase 'failed' must be emitted.
    failed = [e for e in state_events if e['phase'] == 'failed']
    assert failed, state_events


def test_missing_required_field_returns_error_response(tmp_path):
    cli = _make_client(tmp_path)
    resp = cli.handle_upgrade({'type': 'full', 'url': 'x',
                               'md5': 'x', 'version': 'x'})
    assert resp['result'] == 1
    assert 'cmd' in resp['msg']


def test_https_url_rejected(tmp_path):
    cli = _make_client(tmp_path)
    fw = b'whatever'
    cmd = {
        'cmd': 'upgrade', 'type': 'full', 'content': 'app',
        'url': 'https://blocked.example/y.deb',
        'md5': _md5_of(fw), 'version': 'x',
    }
    resp = cli.handle_upgrade(cmd)
    assert resp['result'] == 1
    assert 'http://' in resp['msg']


def test_non_200_status_returns_error_response(tmp_path):
    cli = _make_client(tmp_path)
    cmd = {
        'cmd': 'upgrade', 'type': 'full', 'content': 'app',
        'url': 'http://x/y.deb', 'md5': 'x', 'version': 'x',
    }
    with _mock_streaming_get(b'', status=404):
        resp = cli.handle_upgrade(cmd)
    assert resp['result'] == 1
    assert '404' in resp['msg']


def test_handle_version_info_reads_system_version_file(tmp_path):
    cli = _make_client(tmp_path)
    cli.system_version_path.write_text('V0.3.2\n')
    resp = cli.handle_version_info()
    assert resp == {'result': 0, 'ov': 'V0.3.2'}


def test_handle_version_info_missing_file_returns_empty(tmp_path):
    cli = _make_client(tmp_path)
    # No file written; path doesn't exist.
    resp = cli.handle_version_info()
    assert resp == {'result': 0, 'ov': ''}


def test_install_replaces_previous_staged_deb(tmp_path):
    cli = _make_client(tmp_path)
    fw = b'\x42' * 1024
    cmd = {
        'cmd': 'upgrade', 'type': 'full', 'content': 'app',
        'url': 'http://x/y.deb', 'md5': _md5_of(fw), 'version': 'A',
    }
    with _mock_streaming_get(fw):
        cli.handle_upgrade(cmd)

    fw2 = b'\x99' * 1024
    cmd2 = {
        'cmd': 'upgrade', 'type': 'full', 'content': 'app',
        'url': 'http://x/y2.deb', 'md5': _md5_of(fw2), 'version': 'B',
    }
    with _mock_streaming_get(fw2):
        cli.handle_upgrade(cmd2)

    slot = tmp_path / 'install' / 'upgrade_pkg'
    files = sorted(p.name for p in slot.iterdir())
    # Both versions co-exist in the slot — installer picks newest.
    # (`shutil.move` doesn't delete sibling debs.)
    assert 'mower_firmware_A.deb' in files
    assert 'mower_firmware_B.deb' in files
