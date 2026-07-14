/**
 * Regressie: alternate_direction roteerde nooit omdat de teller op
 * work_records.schedule_id liep — de maaier stuurt geen scheduleId mee bij
 * runner-gestarte mows, dus count bleef 0. De rotatie draait nu op
 * dashboard_schedules.trigger_count die de runner zelf ophoogt.
 */
import { describe, it, expect } from 'vitest';
import { scheduleRepo } from '../../db/repositories/index.js';

describe('ScheduleRepository.trigger_count', () => {
  it('starts at 0 and increments per geslaagde trigger', () => {
    scheduleRepo.create({ schedule_id: 'alt-1', mower_sn: 'LFIN0001', start_time: '09:00' });
    expect(scheduleRepo.findById('alt-1')?.trigger_count).toBe(0);

    scheduleRepo.incrementTriggerCount('alt-1');
    scheduleRepo.incrementTriggerCount('alt-1');
    expect(scheduleRepo.findById('alt-1')?.trigger_count).toBe(2);

    // dag 0: 60°, dag 1: 60+90=150° — de formule uit triggerSchedule
    const row = scheduleRepo.findById('alt-1')!;
    expect((60 + row.trigger_count * 90) % 360).toBe(240);
  });
});
