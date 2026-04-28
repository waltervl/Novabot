"""paho-mqtt wrapper with AES-aware publish + subscribe.

NO domain whitelist — set_mqtt_info accepting bare IPs is one of the
explicit reasons we are replacing the stock binary. The host can be
any string the broker accepts (DNS name, IPv4, IPv6, mDNS).

Topic conventions (per docs/reference/MQTT.md):
  Dart/Send_mqtt/<SN>         app → mower (commands)
  Dart/Receive_mqtt/<SN>      mower → app (responses + reports)
  Dart/Receive_server_mqtt/<SN>  mower → server (server-only reports)
"""
from __future__ import annotations
import logging
from typing import Callable, Optional

import paho.mqtt.client as mqtt

from aes import encrypt, decrypt

log = logging.getLogger('mqtt_node.mqtt_client')

InboundHandler = Callable[[str, str, bytes], None]
"""(sn, topic, decrypted_payload) -> None"""


class MqttClient:
    def __init__(self, host: str, port: int, sn: str, keepalive: int = 30):
        self.host = host
        self.port = port
        self.sn = sn
        self.keepalive = keepalive
        self._cli = mqtt.Client(client_id=f'open_mqtt_node_{sn}')
        self._handler: Optional[InboundHandler] = None
        self._cli.on_message = self._on_message

    def on_message(self, handler: InboundHandler) -> None:
        self._handler = handler

    def connect(self) -> None:
        self._cli.connect(self.host, self.port, keepalive=self.keepalive)
        # Subscribe to inbound only (app → mower). Dart/Receive_mqtt is the
        # outbound (mower → app) direction we PUBLISH to — subscribing
        # would create a feedback loop on our own responses.
        self._cli.subscribe(f'Dart/Send_mqtt/{self.sn}')

    def swap_broker(self, host: str, port: int) -> None:
        """Disconnect from the current broker, point the client at a new
        host:port, and reconnect. Called by the discovery loop when an
        mDNS-confirmed switch lands. Safe to call from a non-asyncio thread
        — paho-mqtt's loop_start spins its own worker."""
        try:
            if self._cli is not None:
                try:
                    self._cli.disconnect()
                except Exception:
                    pass
        finally:
            self.host = host
            self.port = port
            # Re-run the existing connect flow with the new host/port.
            self.connect()

    def publish(self, topic: str, payload: bytes, encrypted: bool = True,
                qos: int = 1) -> None:
        body = encrypt(self.sn, payload) if encrypted else payload
        self._cli.publish(topic, body, qos=qos)

    def loop_start(self) -> None:
        self._cli.loop_start()

    def loop_stop(self) -> None:
        self._cli.loop_stop()

    def disconnect(self) -> None:
        try:
            self._cli.disconnect()
        except Exception:
            pass

    def reconnect(self, host: str, port: int) -> None:
        """Re-target the broker without re-subscribing. Used by
        set_mqtt_info commits (BLE provisioning path) so a freshly
        configured broker takes effect immediately, no reboot required.

        paho's connect() can be called repeatedly on the same client;
        the previous TCP session is torn down inside paho's network
        loop and a new one opened. We re-subscribe to be defensive in
        case the broker drops session state.
        """
        self.host = host
        self.port = port
        try:
            self._cli.disconnect()
        except Exception:
            pass
        self._cli.connect(self.host, self.port, keepalive=self.keepalive)
        self._cli.subscribe(f'Dart/Send_mqtt/{self.sn}')

    # ── Internal ────────────────────────────────────────────────────
    def _on_message(self, _client, _userdata, msg) -> None:  # noqa: D401
        if not self._handler:
            return
        sn = msg.topic.rsplit('/', 1)[-1]
        plaintext = decrypt(sn, msg.payload)
        if plaintext is None:
            log.warning('mqtt_client: decrypt failed for %s (%d bytes)',
                        msg.topic, len(msg.payload))
            return
        try:
            self._handler(sn, msg.topic, plaintext)
        except Exception:
            log.exception('mqtt_client handler raised on %s', msg.topic)
