"""In-process scheduled-task queue.

Stock binary uses an internal C++ `task_timer_queue` (decompile line
325566 — `send_msg_to_task_timer_queue(2, 0)`) to manage scheduled
mowing tasks. This module is the open-Python equivalent: persistent,
respawn-safe, simple cron-like firing of registered callbacks.

Public API:

    queue = TimerQueue(state_path=Path('/userdata/open_mqtt_node/scheduled_tasks.json'),
                       on_fire=lambda task: bridge.handle_start_navigation(task['payload']))
    queue.start()
    queue.add_task(task_id='abc', week=[1,2,3,4,5], hour=8, minute=0,
                   work_time=3600, payload={...})
    queue.cancel(task_id='abc')

State file layout:

    [
      {"id": "abc",
       "week": [1, 2, 3, 4, 5],
       "hour": 8,
       "minute": 0,
       "work_time": 3600,
       "payload": {...}},
      ...
    ]

Cron evaluation:
- `week` is ISO-week-day (1=Mon..7=Sun) per Python `datetime.weekday()+1`.
- `hour` + `minute` are local time (timezone from /userdata/ota/novabot_timezone.txt
  if present; otherwise system local).
- A task fires at most once per (week-day, hour, minute) triple. Repeat
  enforcement is per-day — the same task on Monday at 08:00 fires once.

Persistence:
- Writes the state file on every add/cancel.
- Reads on start; missing file = empty queue.
- File rotation is atomic (tmp + replace).

The dispatcher thread is a single daemon that wakes up every 30 s and
checks "is the next due task within the next minute?". A 30 s tick gives
us at-most ~30 s firing latency, which is fine for mowing schedules
(stock binary fires at minute boundaries with similar latency).
"""
from __future__ import annotations
import json
import logging
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

log = logging.getLogger('mqtt_node.timer_queue')


@dataclass
class ScheduledTask:
    id: str
    week: List[int]                      # ISO weekdays, 1=Mon..7=Sun
    hour: int                            # 0..23
    minute: int                          # 0..59
    work_time: int = 0                   # seconds; informational, not enforced here
    payload: Dict[str, Any] = field(default_factory=dict)
    last_fired_iso: str = ''             # 'YYYY-MM-DDThh:mm' of last fire

    def matches(self, now_local: datetime) -> bool:
        """True if this task is due at the current minute."""
        iso_weekday = now_local.weekday() + 1   # Mon=1..Sun=7
        if iso_weekday not in self.week:
            return False
        return now_local.hour == self.hour and now_local.minute == self.minute

    def already_fired(self, now_local: datetime) -> bool:
        """Same minute already produced a fire — block re-fire."""
        return self.last_fired_iso == now_local.strftime('%Y-%m-%dT%H:%M')


FireCallback = Callable[[Dict[str, Any]], None]
"""Invoked with task.payload when a task fires."""


class TimerQueue:
    def __init__(self,
                 state_path: Path,
                 on_fire: FireCallback,
                 *,
                 tick_seconds: float = 30.0):
        self._state_path = Path(state_path)
        self._on_fire = on_fire
        self._tick_seconds = float(tick_seconds)
        self._tasks: List[ScheduledTask] = []
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._load()

    # ── public API ─────────────────────────────────────────────

    def add_task(self, *, task_id: str, week: List[int],
                 hour: int, minute: int,
                 work_time: int = 0,
                 payload: Optional[Dict[str, Any]] = None) -> None:
        if not (0 <= hour < 24 and 0 <= minute < 60):
            raise ValueError(f'hour/minute out of range: {hour}:{minute}')
        cleaned_week = sorted({int(d) for d in week if 1 <= int(d) <= 7})
        if not cleaned_week:
            raise ValueError('week must contain at least one ISO weekday (1..7)')
        task = ScheduledTask(
            id=str(task_id),
            week=cleaned_week,
            hour=int(hour),
            minute=int(minute),
            work_time=int(work_time),
            payload=dict(payload or {}),
        )
        with self._lock:
            # Replace by id (idempotent reschedule).
            self._tasks = [t for t in self._tasks if t.id != task.id]
            self._tasks.append(task)
            self._save()
        log.info('timer_queue: added id=%s week=%s %02d:%02d',
                 task.id, task.week, task.hour, task.minute)

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            before = len(self._tasks)
            self._tasks = [t for t in self._tasks if t.id != task_id]
            removed = len(self._tasks) < before
            if removed:
                self._save()
        if removed:
            log.info('timer_queue: cancelled id=%s', task_id)
        return removed

    def list_tasks(self) -> List[ScheduledTask]:
        with self._lock:
            return list(self._tasks)

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name='timer_queue')
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=self._tick_seconds + 1.0)

    # ── plan lookup glue (for PlanCheckTask) ───────────────────

    def plan_lookup(self, week: str) -> tuple[int, str]:
        """Used by the bridge's PlanCheckTask service handler.

        Stock contract: `week` is a string, response carries
        (value: int, plan: str). value=0 means "no plan", value>0 +
        non-empty plan means "plan present, content in `plan`".

        We collapse the queue to a JSON string of all tasks scheduled
        for the requested ISO weekday — keeps the contract honest
        without inventing schema.
        """
        try:
            wd = int(week)
        except (TypeError, ValueError):
            return 0, ''
        with self._lock:
            matched = [
                {'id': t.id, 'hour': t.hour, 'minute': t.minute,
                 'work_time': t.work_time}
                for t in self._tasks if wd in t.week
            ]
        if not matched:
            return 0, ''
        return len(matched), json.dumps(matched, separators=(',', ':'))

    # ── internals ──────────────────────────────────────────────

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._tick()
            except Exception:
                log.exception('timer_queue: tick failed')
            self._stop.wait(self._tick_seconds)

    def _tick(self) -> None:
        now = self._now_local()
        with self._lock:
            tasks = list(self._tasks)
        for task in tasks:
            if not task.matches(now) or task.already_fired(now):
                continue
            log.info('timer_queue: firing id=%s at %s', task.id, now.isoformat())
            try:
                self._on_fire(task.payload)
            except Exception:
                log.exception('timer_queue: on_fire raised for %s', task.id)
            task.last_fired_iso = now.strftime('%Y-%m-%dT%H:%M')
            with self._lock:
                self._save()

    def _now_local(self) -> datetime:
        """datetime.now() with the on-disk timezone applied if available.

        Falls back to system local. The timezone file is the same one
        BLE set_cfg_info writes to (`/userdata/ota/novabot_timezone.txt`)
        — see CLAUDE.md "BLE Provisioning".
        """
        tz_path = Path('/userdata/ota/novabot_timezone.txt')
        if tz_path.is_file():
            try:
                from zoneinfo import ZoneInfo
                tz_name = tz_path.read_text().strip()
                if tz_name:
                    return datetime.now(ZoneInfo(tz_name)).replace(tzinfo=None)
            except Exception:
                pass
        return datetime.now()

    def _load(self) -> None:
        if not self._state_path.is_file():
            return
        try:
            data = json.loads(self._state_path.read_text())
        except Exception:
            log.exception('timer_queue: state file corrupt — starting empty')
            return
        out: List[ScheduledTask] = []
        for entry in data:
            try:
                out.append(ScheduledTask(**entry))
            except Exception:
                log.warning('timer_queue: dropping invalid entry %r', entry)
        self._tasks = out
        log.info('timer_queue: loaded %d task(s) from %s',
                 len(self._tasks), self._state_path)

    def _save(self) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._state_path.with_suffix('.json.tmp')
        tmp.write_text(json.dumps([asdict(t) for t in self._tasks], indent=2))
        tmp.replace(self._state_path)
