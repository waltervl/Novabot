"""Timer queue — scheduled mowing fires at the right minute, persists,
deduplicates same-minute fires, and exposes a PlanCheckTask lookup."""
import json
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from timer_queue import ScheduledTask, TimerQueue


@pytest.fixture
def state_file(tmp_path):
    return tmp_path / 'scheduled_tasks.json'


def _at(year=2026, month=4, day=27, hour=0, minute=0):
    """Helper: build a fixed-time datetime."""
    return datetime(year, month, day, hour, minute)


def test_add_task_persists_to_state_file(state_file):
    fired = []
    q = TimerQueue(state_file, on_fire=fired.append)
    q.add_task(task_id='abc', week=[1, 2, 3], hour=8, minute=0,
               work_time=600, payload={'mapName': 'map0'})
    assert state_file.is_file()
    data = json.loads(state_file.read_text())
    assert len(data) == 1
    assert data[0]['id'] == 'abc'
    assert data[0]['week'] == [1, 2, 3]
    assert data[0]['payload'] == {'mapName': 'map0'}


def test_load_resumes_after_restart(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    q.add_task(task_id='zzz', week=[7], hour=23, minute=59,
               payload={'a': 1})

    # Re-instantiate — should pick the existing tasks back up.
    q2 = TimerQueue(state_file, on_fire=lambda _: None)
    tasks = q2.list_tasks()
    assert len(tasks) == 1
    assert tasks[0].id == 'zzz'
    assert tasks[0].payload == {'a': 1}


def test_cancel_removes_task(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    q.add_task(task_id='x', week=[1], hour=8, minute=0)
    assert len(q.list_tasks()) == 1
    assert q.cancel('x') is True
    assert q.list_tasks() == []
    assert q.cancel('x') is False  # double-cancel is a no-op


def test_cancel_unknown_returns_false(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    assert q.cancel('nope') is False


def test_add_task_replaces_same_id(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    q.add_task(task_id='same', week=[1], hour=8, minute=0)
    q.add_task(task_id='same', week=[2], hour=10, minute=0)
    tasks = q.list_tasks()
    assert len(tasks) == 1
    assert tasks[0].week == [2]


def test_invalid_hour_minute_raises(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    with pytest.raises(ValueError):
        q.add_task(task_id='x', week=[1], hour=24, minute=0)
    with pytest.raises(ValueError):
        q.add_task(task_id='x', week=[1], hour=0, minute=60)


def test_invalid_week_raises(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    with pytest.raises(ValueError):
        q.add_task(task_id='x', week=[], hour=0, minute=0)


def test_tick_fires_matching_task(state_file):
    fired = []
    q = TimerQueue(state_file, on_fire=fired.append)
    q.add_task(task_id='m', week=[1], hour=8, minute=0,
               payload={'go': True})
    # Monday 2026-04-27, 8:00 AM
    with patch.object(q, '_now_local', return_value=_at(2026, 4, 27, 8, 0)):
        q._tick()
    assert fired == [{'go': True}]


def test_tick_skips_non_matching_weekday(state_file):
    fired = []
    q = TimerQueue(state_file, on_fire=fired.append)
    # Monday only
    q.add_task(task_id='m', week=[1], hour=8, minute=0)
    # 2026-04-28 is Tuesday
    with patch.object(q, '_now_local', return_value=_at(2026, 4, 28, 8, 0)):
        q._tick()
    assert fired == []


def test_tick_dedups_within_same_minute(state_file):
    fired = []
    q = TimerQueue(state_file, on_fire=fired.append)
    q.add_task(task_id='m', week=[1], hour=8, minute=0)
    fixed = _at(2026, 4, 27, 8, 0)
    with patch.object(q, '_now_local', return_value=fixed):
        q._tick()
        q._tick()  # second call same minute — no second fire
        q._tick()
    assert fired == [{}]


def test_tick_re_fires_next_day(state_file):
    fired = []
    q = TimerQueue(state_file, on_fire=fired.append)
    q.add_task(task_id='m', week=[1, 2], hour=8, minute=0)
    # Monday 8:00 → fire
    with patch.object(q, '_now_local', return_value=_at(2026, 4, 27, 8, 0)):
        q._tick()
    # Tuesday 8:00 → fire again
    with patch.object(q, '_now_local', return_value=_at(2026, 4, 28, 8, 0)):
        q._tick()
    assert len(fired) == 2


def test_plan_lookup_returns_count_and_json(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    q.add_task(task_id='a', week=[1], hour=8, minute=0)
    q.add_task(task_id='b', week=[1], hour=10, minute=30)
    q.add_task(task_id='c', week=[2], hour=8, minute=0)
    value, plan = q.plan_lookup('1')
    assert value == 2
    parsed = json.loads(plan)
    assert sorted(p['id'] for p in parsed) == ['a', 'b']


def test_plan_lookup_no_match_returns_zero(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    q.add_task(task_id='a', week=[1], hour=8, minute=0)
    value, plan = q.plan_lookup('5')
    assert value == 0
    assert plan == ''


def test_plan_lookup_invalid_input_returns_zero(state_file):
    q = TimerQueue(state_file, on_fire=lambda _: None)
    q.add_task(task_id='a', week=[1], hour=8, minute=0)
    value, plan = q.plan_lookup('not-a-number')
    assert value == 0
    assert plan == ''


def test_persist_round_trips_last_fired_iso(state_file):
    fired = []
    q = TimerQueue(state_file, on_fire=fired.append)
    q.add_task(task_id='m', week=[1], hour=8, minute=0)
    fixed = _at(2026, 4, 27, 8, 0)
    with patch.object(q, '_now_local', return_value=fixed):
        q._tick()
    # Re-load and verify last_fired_iso is preserved.
    q2 = TimerQueue(state_file, on_fire=fired.append)
    tasks = q2.list_tasks()
    assert tasks[0].last_fired_iso == '2026-04-27T08:00'
    # Re-firing on the same minute is suppressed even after restart.
    with patch.object(q2, '_now_local', return_value=fixed):
        q2._tick()
    assert len(fired) == 1


def test_corrupt_state_file_treated_as_empty(state_file):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text('{not json}')
    q = TimerQueue(state_file, on_fire=lambda _: None)
    assert q.list_tasks() == []


def test_on_fire_exception_does_not_break_loop(state_file):
    crashed = {'count': 0}

    def boom(_payload):
        crashed['count'] += 1
        raise RuntimeError('disk full')

    q = TimerQueue(state_file, on_fire=boom)
    q.add_task(task_id='m', week=[1], hour=8, minute=0)
    with patch.object(q, '_now_local', return_value=_at(2026, 4, 27, 8, 0)):
        q._tick()
    assert crashed['count'] == 1
    # Subsequent tick (different minute) still works.
    with patch.object(q, '_now_local', return_value=_at(2026, 4, 27, 9, 0)):
        q._tick()  # no fire — minute doesn't match
    assert crashed['count'] == 1
