"""Stub command handlers — JSON-echo only, no side-effects.

These commands have no real backing logic in the stock binary either:
- start_patrol / stop_patrol: confirmed JSON-echo stubs in
  research/documents/mqtt_node-command-catalog.md (decompile lines
  321148-321204 + 321294-321411). Stock binary parses the body, logs
  "api_start_patrol", builds a 0/0 response, publishes — that's it.
- auto_connect: appears in docs/reference/MQTT.md but the stock binary
  has no `api_auto_connect` handler (gap analysis §3A line 122). The
  app sends it as a handshake hint; stock silently drops it.

Implementing them as ack-only stubs gives 100% MQTT inbound coverage
without inventing behaviour. If a future capture reveals real meaning
the stub can be replaced.
"""
from __future__ import annotations
import logging
from typing import Any, Callable, Dict, Optional

log = logging.getLogger('mqtt_node.stub_commands')


def make_handlers() -> Dict[str, Callable[[Any], Optional[Dict[str, Any]]]]:
    def _start_patrol(_body):
        log.info('start_patrol: stub ack (firmware does not implement)')
        return {'result': 0, 'value': 0}

    def _stop_patrol(_body):
        log.info('stop_patrol: stub ack (firmware does not implement)')
        return {'result': 0, 'value': 0}

    def _auto_connect(_body):
        # Stock binary silently drops; we ack with result:0 so the
        # app doesn't retry. No logged warning — too noisy.
        return {'result': 0}

    # Server-pushed status echo stubs. Decompile lines:
    #   report_state_map_outline   — 323402 (status:str, percentage:float)
    #   report_state_map_path_list — 319830 (status:str, percentage:float)
    #   report_state_unbind        — 319973 (status:int)
    # All three are inbound from the cloud during long-running operations
    # (mapping progress, unbind sequence). The mower echoes the same
    # fields back so the cloud can correlate progress events with mower
    # acknowledgement.
    def _report_state_map_outline(body):
        if not isinstance(body, dict):
            body = {}
        return {
            'status': str(body.get('status', '')),
            'percentage': float(body.get('percentage', 0.0)),
        }

    def _report_state_map_path_list(body):
        if not isinstance(body, dict):
            body = {}
        return {
            'status': str(body.get('status', '')),
            'percentage': float(body.get('percentage', 0.0)),
        }

    def _report_state_unbind(body):
        if not isinstance(body, dict):
            body = {}
        try:
            status = int(body.get('status', 0))
        except (TypeError, ValueError):
            status = 0
        return {'status': status}

    return {
        'start_patrol': _start_patrol,
        'stop_patrol': _stop_patrol,
        'auto_connect': _auto_connect,
        'report_state_map_outline': _report_state_map_outline,
        'report_state_map_path_list': _report_state_map_path_list,
        'report_state_unbind': _report_state_unbind,
    }


def register_with_dispatcher(dispatcher) -> None:
    for cmd, handler in make_handlers().items():
        dispatcher.register(cmd, handler)
