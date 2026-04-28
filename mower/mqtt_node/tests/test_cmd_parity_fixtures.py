"""Round-trip parity test: feed each fixture's `inbound` payload
through the dispatcher and assert the published response matches
`expected_response` exactly.

Each fixture cites a source (Ghidra decompile line or bootstrap/app
reference) so future divergence is traceable. The dispatcher wraps
handler return values as `{<cmd>_respond: <body>}` — that's what each
fixture's expected_response captures.

Stubs covered: start_patrol, stop_patrol, auto_connect,
report_state_map_outline, report_state_map_path_list,
report_state_unbind.

BLE provisioning covered: set_wifi_info (mower variant), set_lora_info,
set_mqtt_info, set_cfg_info (mower variant).
"""
import json
from pathlib import Path

import pytest

from ble_commands import ConfigStore, register_with_dispatcher as register_ble
from command_dispatcher import CommandDispatcher
from stub_commands import register_with_dispatcher as register_stubs

FIXTURES = Path(__file__).parent / 'fixtures' / 'cmd_parity'


def _load_fixture(path: Path):
    return json.loads(path.read_text())


def _make_dispatcher(tmp_path):
    """Dispatcher wired with both stubs + BLE handlers + a tmpdir-backed
    ConfigStore. Returns (dispatcher, captured_responses)."""
    seen = []
    dispatcher = CommandDispatcher(
        respond_publisher=lambda key, body: seen.append({key: body}))
    register_stubs(dispatcher)
    store = ConfigStore(
        json_config_path=tmp_path / 'json_config.json',
        http_address_path=tmp_path / 'http_address.txt',
        timezone_path=tmp_path / 'tz.txt',
    )
    register_ble(dispatcher, store=store)
    return dispatcher, seen


@pytest.mark.parametrize('fixture_path', sorted(FIXTURES.glob('*.json')),
                         ids=lambda p: p.stem)
def test_cmd_parity_round_trip(tmp_path, fixture_path):
    fx = _load_fixture(fixture_path)
    dispatcher, seen = _make_dispatcher(tmp_path)
    dispatcher.dispatch(fx['inbound'])
    assert len(seen) == 1, (
        f'expected exactly one response for {fx["command"]}, '
        f'got {len(seen)}: {seen!r}')
    assert seen[0] == fx['expected_response'], (
        f'response mismatch for {fx["command"]}\n'
        f'expected: {fx["expected_response"]}\n'
        f'actual:   {seen[0]}'
    )
