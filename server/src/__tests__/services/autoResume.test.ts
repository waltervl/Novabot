import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub mapSync so checkAutoResume's publishToDevice call resolves
// against a mock instead of trying to reach an MQTT broker.
vi.mock('../../mqtt/mapSync.js', () => ({
  publishToDevice: vi.fn(),
  getNextCmdNum: vi.fn(() => 42),
}));

import { checkAutoResume, resetAutoResumeState } from '../../services/autoResume.js';
import { publishToDevice } from '../../mqtt/mapSync.js';

const SN = 'LFIN1231000211';

function snap(map: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(map));
}

beforeEach(() => {
  resetAutoResumeState(SN);
  vi.mocked(publishToDevice).mockClear();
});

describe('autoResume', () => {
  it('no-op when task_mode is not coverage', () => {
    checkAutoResume(SN, snap({
      task_mode: '0',
      battery_power: '95',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Work:BATTERY_LOW_RECHARGE Recharge: GOING',
    }));
    expect(publishToDevice).not.toHaveBeenCalled();
  });

  it('no-op when not in low-battery pause', () => {
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '95',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Work:WAIT',
    }));
    expect(publishToDevice).not.toHaveBeenCalled();
  });

  it('latches waiting state on BATTERY_LOW_RECHARGE but does not resume mid-drive', () => {
    // Mower driving back to dock — still on battery, not yet charging.
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '15',
      battery_state: 'DISCHARGED',
      msg: 'Mode:COVERAGE Work:BATTERY_LOW_RECHARGE Recharge: GOING',
    }));
    expect(publishToDevice).not.toHaveBeenCalled();
  });

  it('resumes once battery climbs above threshold while docked', () => {
    // Step 1: low-battery return, latches.
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '15',
      battery_state: 'DISCHARGED',
      msg: 'Mode:COVERAGE Work:BATTERY_LOW_RECHARGE Recharge: GOING',
    }));
    // Step 2: docked + charging, below threshold → still waits.
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '60',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Work:CANCELLED Prev work:USER_RECHARGE_STOP Recharge: SUCCESS',
    }));
    expect(publishToDevice).not.toHaveBeenCalled();
    // Step 3: battery hits threshold → publishes resume_navigation.
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '90',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Work:CANCELLED Prev work:USER_RECHARGE_STOP Recharge: SUCCESS',
    }));
    expect(publishToDevice).toHaveBeenCalledOnce();
    expect(publishToDevice).toHaveBeenCalledWith(SN, {
      resume_navigation: { cmd_num: 42 },
    });
  });

  it('cooldown blocks duplicate publishes from rapid sensor frames', () => {
    // Prime + trigger
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '15',
      battery_state: 'DISCHARGED',
      msg: 'Mode:COVERAGE Work:BATTERY_LOW_RECHARGE',
    }));
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '95',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Prev work:USER_RECHARGE_STOP',
    }));
    expect(publishToDevice).toHaveBeenCalledOnce();

    // Re-trigger via a fresh low-battery latch within cooldown — must
    // not publish again. The watcher clears waitingForCharge on resume
    // so the second pass needs to re-arm via the low-battery msg.
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '20',
      battery_state: 'DISCHARGED',
      msg: 'Mode:COVERAGE Work:BATTERY_LOW_RECHARGE',
    }));
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '95',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Prev work:USER_RECHARGE_STOP',
    }));
    expect(publishToDevice).toHaveBeenCalledOnce();
  });

  it('drops waiting flag when coverage task ends', () => {
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '15',
      battery_state: 'DISCHARGED',
      msg: 'Mode:COVERAGE Work:BATTERY_LOW_RECHARGE',
    }));
    // Task cancelled by user — task_mode goes to 0.
    checkAutoResume(SN, snap({
      task_mode: '0',
      battery_power: '95',
      battery_state: 'CHARGING',
      msg: 'Mode:STANDBY',
    }));
    // Returning to dock later should NOT auto-resume an aborted task.
    checkAutoResume(SN, snap({
      task_mode: '1',
      battery_power: '95',
      battery_state: 'CHARGING',
      msg: 'Mode:COVERAGE Work:WAIT',
    }));
    expect(publishToDevice).not.toHaveBeenCalled();
  });
});
