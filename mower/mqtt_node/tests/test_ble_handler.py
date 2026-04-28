"""BLE handler frame parser + command dispatch.

Per memory `ble-provisioning-protocol.md`:
- Frames begin with 'le_start' magic, end with 'le_end'
- Body is plain JSON
- Fragmented frames are reassembled by the framer; full JSON is what
  the dispatcher sees
"""
import json

import pytest

from ble_handler import (
    BleFramer,
    FLUSH_CHAR_UUID,
    NOTIFY_CHAR_UUID,
    SERVICE_UUID,
    WRITE_CHAR_UUID,
    wrap_frame,
)


def test_single_frame_yields_decoded_json():
    framer = BleFramer()
    payload = b'le_start{"set_wifi_info": {"ssid": "x"}}le_end'
    decoded = list(framer.feed(payload))
    assert decoded == [{'set_wifi_info': {'ssid': 'x'}}]


def test_fragmented_frame_reassembled():
    framer = BleFramer()
    out = []
    out.extend(framer.feed(b'le_start{"set_'))
    out.extend(framer.feed(b'mqtt_info":{"addr":"x","port":1883}}le_end'))
    assert out == [{'set_mqtt_info': {'addr': 'x', 'port': 1883}}]


def test_garbage_outside_markers_ignored():
    framer = BleFramer()
    out = list(framer.feed(b'JUNKle_start{"a":1}le_endMORE'))
    assert out == [{'a': 1}]


def test_invalid_json_in_frame_skipped():
    framer = BleFramer()
    out = list(framer.feed(b'le_start{not json}le_end'))
    assert out == []


def test_wrap_frame_round_trip_through_framer():
    framer = BleFramer()
    payload = {'set_wifi_info_respond': {'result': 1, 'msg': 'ok'}}
    out = list(framer.feed(wrap_frame(payload)))
    assert out == [payload]


def test_uuids_match_bootstrap_short_form_expansion():
    # bootstrap/src/ble.ts:23 — mower service '0201', writeChar '0011',
    # notifyChar '0021', flushChar '3333'. BlueZ expands 16-bit shorts
    # via the BLE base UUID 0000XXXX-0000-1000-8000-00805f9b34fb.
    assert SERVICE_UUID == '00000201-0000-1000-8000-00805f9b34fb'
    assert WRITE_CHAR_UUID == '00000011-0000-1000-8000-00805f9b34fb'
    assert NOTIFY_CHAR_UUID == '00000021-0000-1000-8000-00805f9b34fb'
    assert FLUSH_CHAR_UUID == '00003333-0000-1000-8000-00805f9b34fb'
