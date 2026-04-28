"""BLE frame parser + Bluez D-Bus GATT server.

Two layers:

1. BleFramer — pure-Python frame parser. Wraps raw `le_start`/`le_end`
   framed JSON commands written by the app to char 0x0011. No D-Bus
   dependency — used in unit tests on macOS.

2. BleGattServer — Bluez D-Bus GATT server (advertises + serves the
   primary service stock mqtt_node exposes). Imports dbus-next lazily
   so the unit tests stay Mac-friendly. On the mower this brings up
   `Novabot` advertising and registers the same UUIDs the stock binary
   uses (validated against bootstrap/src/ble.ts which has been
   provisioning real mowers for months).

UUIDs (from bootstrap/src/ble.ts:23 — short forms expanded via the
Bluetooth SIG base UUID, the same expansion BlueZ applies on the wire):

    service     = 00000201-0000-1000-8000-00805f9b34fb
    write char  = 00000011-0000-1000-8000-00805f9b34fb (write + notify)
    notify char = 00000021-0000-1000-8000-00805f9b34fb (notify)
    flush char  = 00003333-0000-1000-8000-00805f9b34fb (notify, optional)

The mower-specific quirk (bootstrap/src/ble.ts:531):
> For the mower, responses arrive on writeChar (0011), not notifyChar
> (0021).

So the write characteristic must declare BOTH `write`/`write-without-
response` AND `notify` flags, and our `notify()` API publishes outbound
frames on 0011 by default.

References:
- memory ble-provisioning-protocol.md (frame format + command sequences)
- memory ble-provisioning-facts.md (re-provision works on already-bound
  devices, BLE always advertises)
- bootstrap/src/ble.ts (Node.js noble client — UUID source of truth)
- docs/reference/BLE.md (full payload catalog)
"""
from __future__ import annotations
import asyncio
import json
import logging
import threading
from typing import Any, Callable, Dict, Iterator, Optional

log = logging.getLogger('mqtt_node.ble_handler')

START = b'le_start'
END = b'le_end'

SERVICE_UUID = '00000201-0000-1000-8000-00805f9b34fb'
WRITE_CHAR_UUID = '00000011-0000-1000-8000-00805f9b34fb'
NOTIFY_CHAR_UUID = '00000021-0000-1000-8000-00805f9b34fb'
FLUSH_CHAR_UUID = '00003333-0000-1000-8000-00805f9b34fb'

ADAPTER_PATH = '/org/bluez/hci0'
APP_PATH = '/org/novabot/gatt'
SERVICE_PATH = f'{APP_PATH}/service0'
WRITE_CHAR_PATH = f'{SERVICE_PATH}/char0'
NOTIFY_CHAR_PATH = f'{SERVICE_PATH}/char1'
FLUSH_CHAR_PATH = f'{SERVICE_PATH}/char2'
ADVERT_PATH = f'{APP_PATH}/advertisement0'

ADVERT_NAME = 'Novabot'
"""Local advertised name. Stock binary uses the SN for the charger
('CHARGER_PILE') and a generic 'Novabot' for the mower (see CLAUDE.md
'Bekende apparaten' table). The Flutter app scans for this string."""

MAX_NOTIFY_CHUNK = 180
"""ATT MTU minus headers. Frames longer than this are split across
back-to-back notifications. The framer on the receiving side already
handles concatenation via the le_start/le_end delimiters."""


class BleFramer:
    """Stitches incoming write payloads into full JSON commands.

    Writes can arrive in any chunk size (BLE characteristic ATT MTU,
    typically 20-512 bytes). The stock framing wraps each command in
    `le_start...le_end` so the receiver can find boundaries without an
    explicit length prefix.
    """

    def __init__(self):
        self._buf: bytearray = bytearray()

    def feed(self, chunk: bytes) -> Iterator[Dict[str, Any]]:
        self._buf.extend(chunk)
        while True:
            s = self._buf.find(START)
            if s < 0:
                # No START marker yet — drop everything before the next
                # one so we don't grow the buffer unboundedly on garbage.
                self._buf.clear()
                return
            e = self._buf.find(END, s + len(START))
            if e < 0:
                # Partial frame: trim everything before the START marker
                # and wait for more data.
                if s > 0:
                    del self._buf[:s]
                return
            body = bytes(self._buf[s + len(START):e])
            del self._buf[:e + len(END)]
            try:
                yield json.loads(body.decode('utf-8'))
            except Exception as ex:
                log.warning('ble_framer: discarded invalid frame (%d bytes): %s',
                            len(body), ex)


def wrap_frame(payload: Dict[str, Any]) -> bytes:
    """Encode an outbound JSON payload in the BLE frame envelope."""
    return START + json.dumps(payload, separators=(',', ':')).encode('utf-8') + END


# ─── BlueZ D-Bus GATT server ────────────────────────────────────────────
#
# The server is built on dbus-next ServiceInterfaces. BlueZ scans the
# object tree under our application path via the standard D-Bus
# ObjectManager interface, so each service / characteristic is published
# at a stable path with the correct interface signatures BlueZ expects.
#
# Only imported lazily inside BleGattServer.start() to keep the test
# suite Mac-friendly (dbus-next is installable on macOS but BlueZ is not,
# so the server itself can never run there).


class BleGattServer:
    """Owns the dbus-next loop + BlueZ registrations.

    Lifecycle:

        server = BleGattServer(on_command=dispatch)
        server.start()   # blocking thread → bring-up + advertise
        server.notify({'set_wifi_info_respond': {'result': 1}})
        server.stop()

    `start()` runs the asyncio loop on a background thread. `notify()`
    is thread-safe — it schedules a coroutine onto the loop. `stop()`
    cancels everything and joins the thread.
    """

    def __init__(self,
                 on_command: Callable[[Dict[str, Any]], None],
                 framer: Optional[BleFramer] = None,
                 adapter_path: str = ADAPTER_PATH,
                 advert_name: str = ADVERT_NAME):
        self._on_command = on_command
        self._framer = framer or BleFramer()
        self._adapter_path = adapter_path
        self._advert_name = advert_name
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_thread: Optional[threading.Thread] = None
        self._app: Optional['BleApplication'] = None
        self._stopping = threading.Event()

    def start(self) -> None:
        """Bring up the asyncio loop on a daemon thread + register with
        BlueZ. Returns once the application is registered, so callers
        can publish notifications immediately after."""
        ready = threading.Event()
        err: list = []

        def _runner():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                self._loop = loop
                loop.run_until_complete(self._setup())
                ready.set()
                loop.run_forever()
            except Exception as exc:    # pragma: no cover — logged at runtime
                log.exception('BleGattServer thread crashed')
                err.append(exc)
                ready.set()

        self._loop_thread = threading.Thread(
            target=_runner, daemon=True, name='ble_gatt_server')
        self._loop_thread.start()
        ready.wait()
        if err:
            raise err[0]

    def stop(self) -> None:
        if self._stopping.is_set():
            return
        self._stopping.set()
        loop = self._loop
        if loop is None:
            return
        # Drop the registrations + stop the loop.
        async def _shutdown():
            if self._app is not None:
                try:
                    await self._app.unregister()
                except Exception:
                    log.exception('BleGattServer: unregister failed')
            loop.stop()
        try:
            asyncio.run_coroutine_threadsafe(_shutdown(), loop).result(timeout=3.0)
        except Exception:
            log.exception('BleGattServer: stop coroutine failed')
        if self._loop_thread is not None:
            self._loop_thread.join(timeout=3.0)

    def notify(self, payload: Dict[str, Any], char_uuid: str = WRITE_CHAR_UUID) -> None:
        """Send a JSON payload back to the connected app.

        Default characteristic is the write char (0011) because the
        stock binary publishes responses on that handle for the mower
        — confirmed by bootstrap/src/ble.ts:531 ('responses arrive on
        writeChar, not notifyChar')."""
        loop = self._loop
        if loop is None or self._app is None:
            log.warning('BleGattServer.notify: server not running')
            return
        body = wrap_frame(payload)
        asyncio.run_coroutine_threadsafe(
            self._app.notify_chunked(char_uuid, body), loop)

    # ─── internal asyncio setup ─────────────────────────────────────

    async def _setup(self) -> None:
        from dbus_next.aio import MessageBus
        from dbus_next import BusType

        bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
        self._app = BleApplication(
            bus=bus,
            on_command=self._handle_inbound,
            framer=self._framer,
            adapter_path=self._adapter_path,
            advert_name=self._advert_name,
        )
        await self._app.register()
        log.info('BleGattServer: advertising %r on %s', self._advert_name,
                 self._adapter_path)

    def _handle_inbound(self, payload: Dict[str, Any]) -> None:
        try:
            self._on_command(payload)
        except Exception:
            log.exception('BleGattServer: on_command raised for %r', payload)


class BleApplication:
    """Owns service + characteristic D-Bus objects + advertisement.

    Exposes register()/unregister()/notify_chunked(). All public methods
    are coroutines — the public API on BleGattServer wraps these with
    thread-safe scheduling.
    """

    def __init__(self, bus, on_command, framer, adapter_path, advert_name):
        self._bus = bus
        self._on_command = on_command
        self._framer = framer
        self._adapter_path = adapter_path
        self._advert_name = advert_name
        self._registered = False

        # Build the interface tree.
        self._service = _GattService(SERVICE_PATH, SERVICE_UUID, primary=True)
        self._write_char = _GattCharacteristic(
            path=WRITE_CHAR_PATH,
            uuid=WRITE_CHAR_UUID,
            service_path=SERVICE_PATH,
            flags=['write', 'write-without-response', 'notify'],
            on_write=self._on_write,
        )
        self._notify_char = _GattCharacteristic(
            path=NOTIFY_CHAR_PATH,
            uuid=NOTIFY_CHAR_UUID,
            service_path=SERVICE_PATH,
            flags=['notify'],
        )
        self._flush_char = _GattCharacteristic(
            path=FLUSH_CHAR_PATH,
            uuid=FLUSH_CHAR_UUID,
            service_path=SERVICE_PATH,
            flags=['notify'],
        )
        self._chars_by_uuid = {
            WRITE_CHAR_UUID: self._write_char,
            NOTIFY_CHAR_UUID: self._notify_char,
            FLUSH_CHAR_UUID: self._flush_char,
        }
        self._advertisement = _LeAdvertisement(
            path=ADVERT_PATH,
            local_name=advert_name,
            service_uuids=[SERVICE_UUID],
        )
        self._object_manager = _ObjectManager(
            app_path=APP_PATH,
            children=[self._service, self._write_char,
                      self._notify_char, self._flush_char],
        )

    async def register(self) -> None:
        # Export every interface on the bus.
        self._bus.export(APP_PATH, self._object_manager)
        self._bus.export(SERVICE_PATH, self._service)
        self._bus.export(WRITE_CHAR_PATH, self._write_char)
        self._bus.export(NOTIFY_CHAR_PATH, self._notify_char)
        self._bus.export(FLUSH_CHAR_PATH, self._flush_char)
        self._bus.export(ADVERT_PATH, self._advertisement)

        # Register the GATT application with BlueZ.
        gatt_iface = await _bluez_iface(
            self._bus, self._adapter_path, 'org.bluez.GattManager1')
        await gatt_iface.call_register_application(APP_PATH, {})

        # Register the advertisement.
        adv_iface = await _bluez_iface(
            self._bus, self._adapter_path, 'org.bluez.LEAdvertisingManager1')
        await adv_iface.call_register_advertisement(ADVERT_PATH, {})

        self._registered = True

    async def unregister(self) -> None:
        if not self._registered:
            return
        try:
            adv_iface = await _bluez_iface(
                self._bus, self._adapter_path, 'org.bluez.LEAdvertisingManager1')
            await adv_iface.call_unregister_advertisement(ADVERT_PATH)
        except Exception:
            log.exception('BleApplication: unregister advert failed')
        try:
            gatt_iface = await _bluez_iface(
                self._bus, self._adapter_path, 'org.bluez.GattManager1')
            await gatt_iface.call_unregister_application(APP_PATH)
        except Exception:
            log.exception('BleApplication: unregister application failed')
        for path in (ADVERT_PATH, FLUSH_CHAR_PATH, NOTIFY_CHAR_PATH,
                     WRITE_CHAR_PATH, SERVICE_PATH, APP_PATH):
            try:
                self._bus.unexport(path)
            except Exception:
                pass
        self._registered = False

    async def notify_chunked(self, char_uuid: str, body: bytes) -> None:
        char = self._chars_by_uuid.get(char_uuid)
        if char is None:
            log.warning('BleApplication.notify: unknown char_uuid %s', char_uuid)
            return
        for offset in range(0, len(body), MAX_NOTIFY_CHUNK):
            chunk = body[offset:offset + MAX_NOTIFY_CHUNK]
            await char.send_notify(chunk)

    def _on_write(self, value: bytes) -> None:
        """Called from _GattCharacteristic write callback."""
        for cmd in self._framer.feed(value):
            self._on_command(cmd)


# ─── D-Bus interface implementations ────────────────────────────────────


def _bluez_iface(bus, path, iface):
    """Resolve a BlueZ adapter interface for method calls."""
    async def _resolve():
        introspection = await bus.introspect('org.bluez', path)
        proxy = bus.get_proxy_object('org.bluez', path, introspection)
        return proxy.get_interface(iface)
    return _resolve()


def _GattService(path, uuid, primary):
    """Factory wrapping the dbus-next ServiceInterface for a GATT service.
    Lazy import keeps top-level import on macOS clean."""
    from dbus_next.service import ServiceInterface, dbus_property
    from dbus_next.constants import PropertyAccess

    class GattService(ServiceInterface):
        def __init__(self):
            super().__init__('org.bluez.GattService1')
            self._uuid = uuid
            self._primary = primary
            self._path = path

        @dbus_property(access=PropertyAccess.READ)
        def UUID(self) -> 's':  # noqa: F821
            return self._uuid

        @dbus_property(access=PropertyAccess.READ)
        def Primary(self) -> 'b':  # noqa: F821
            return self._primary

    return GattService()


def _GattCharacteristic(path, uuid, service_path, flags, on_write=None):
    """Factory wrapping the dbus-next ServiceInterface for a GATT char.

    `flags` ⊆ {'read','write','write-without-response','notify',
    'indicate','authenticated-signed-writes',...} per BlueZ spec.
    `on_write(bytes)` is invoked synchronously when the central writes
    to this char. send_notify(bytes) is awaited to push out a notify."""
    from dbus_next.service import ServiceInterface, method, dbus_property
    from dbus_next.signature import Variant
    from dbus_next.constants import PropertyAccess

    char_path = path

    class GattCharacteristic(ServiceInterface):
        def __init__(self):
            super().__init__('org.bluez.GattCharacteristic1')
            self._uuid = uuid
            self._service_path = service_path
            self._flags = list(flags)
            self._notifying = False
            self._value: bytes = b''
            self._path = char_path
            self._on_write = on_write

        @dbus_property(access=PropertyAccess.READ)
        def UUID(self) -> 's':  # noqa: F821
            return self._uuid

        @dbus_property(access=PropertyAccess.READ)
        def Service(self) -> 'o':  # noqa: F821
            return self._service_path

        @dbus_property(access=PropertyAccess.READ)
        def Flags(self) -> 'as':  # noqa: F821
            return self._flags

        @dbus_property(access=PropertyAccess.READ)
        def Notifying(self) -> 'b':  # noqa: F821
            return self._notifying

        @method()
        def ReadValue(self, options: 'a{sv}') -> 'ay':  # noqa: F821
            return list(self._value)

        @method()
        def WriteValue(self, value: 'ay', options: 'a{sv}'):  # noqa: F821
            data = bytes(value)
            self._value = data
            log.debug('GATT write %s: %d bytes', self._uuid, len(data))
            if self._on_write is not None:
                try:
                    self._on_write(data)
                except Exception:
                    log.exception('GATT write callback raised')

        @method()
        def StartNotify(self):
            self._notifying = True
            log.info('GATT %s: notify subscribed', self._uuid)
            self.emit_properties_changed({'Notifying': True})

        @method()
        def StopNotify(self):
            self._notifying = False
            log.info('GATT %s: notify unsubscribed', self._uuid)
            self.emit_properties_changed({'Notifying': False})

        async def send_notify(self, data: bytes) -> None:
            if not self._notifying:
                log.debug('GATT %s: send_notify dropped (no subscriber)', self._uuid)
                return
            self._value = data
            self.emit_properties_changed({'Value': Variant('ay', list(data))})

    return GattCharacteristic()


def _LeAdvertisement(path, local_name, service_uuids):
    from dbus_next.service import ServiceInterface, method, dbus_property
    from dbus_next.constants import PropertyAccess

    class LeAdvertisement(ServiceInterface):
        def __init__(self):
            super().__init__('org.bluez.LEAdvertisement1')
            self._local_name = local_name
            self._service_uuids = list(service_uuids)
            self._path = path

        @dbus_property(access=PropertyAccess.READ)
        def Type(self) -> 's':  # noqa: F821
            return 'peripheral'

        @dbus_property(access=PropertyAccess.READ)
        def LocalName(self) -> 's':  # noqa: F821
            return self._local_name

        @dbus_property(access=PropertyAccess.READ)
        def ServiceUUIDs(self) -> 'as':  # noqa: F821
            return self._service_uuids

        @method()
        def Release(self):
            log.info('LeAdvertisement: released by BlueZ')

    return LeAdvertisement()


def _ObjectManager(app_path, children):
    """ObjectManager interface BlueZ uses to enumerate service tree."""
    from dbus_next.service import ServiceInterface, method
    from dbus_next.signature import Variant

    class ObjectManager(ServiceInterface):
        def __init__(self):
            super().__init__('org.freedesktop.DBus.ObjectManager')
            self._app_path = app_path
            self._children = list(children)

        @method()
        def GetManagedObjects(self) -> 'a{oa{sa{sv}}}':  # noqa: F821
            response = {}
            for child in self._children:
                interfaces = {}
                for iface in child._interfaces:  # dbus-next attribute
                    iface_name = iface.name
                    props = {}
                    for prop_name, prop in iface._properties.items():
                        try:
                            value = getattr(child, prop_name)
                        except Exception:
                            continue
                        props[prop_name] = Variant(prop.signature, value)
                    interfaces[iface_name] = props
                response[child._path] = interfaces
            return response

    return ObjectManager()


# ─── Public entry point — replaces the previous NotImplementedError stub
def start_gatt_server(framer: BleFramer,
                      on_command: Callable[[Dict[str, Any]], None]
                      ) -> BleGattServer:
    """Start the GATT server. Blocks until BlueZ confirms registration.

    Caller retains the returned server handle to push notifications back
    to the connected app via `server.notify(payload_dict)` and to stop
    the server cleanly on shutdown.
    """
    server = BleGattServer(on_command=on_command, framer=framer)
    server.start()
    return server
