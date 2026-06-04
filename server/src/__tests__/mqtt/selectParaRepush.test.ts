import { describe, it, expect } from 'vitest';
import { selectParaRepush } from '../../mqtt/paraRepush.js';

describe('selectParaRepush', () => {
  it('returns null when there are no rows', () => {
    expect(selectParaRepush([])).toBeNull();
  });

  it('keeps only allowlisted para keys, converting numeric strings to numbers', () => {
    const para = selectParaRepush([
      { key: 'obstacle_avoidance_sensitivity', value: '3' },
      { key: 'headlight', value: '1' },
      { key: 'sound', value: '0' },
      { key: 'path_direction', value: '1' },
      { key: 'manual_controller_v', value: '0.3' },
      { key: 'manual_controller_w', value: '0.5' },
    ]);
    expect(para).toEqual({
      obstacle_avoidance_sensitivity: 3,
      headlight: 1,
      sound: 0,
      path_direction: 1,
      manual_controller_v: 0.3,
      manual_controller_w: 0.5,
    });
  });

  it('NEVER re-pushes frame flags or sensor overrides', () => {
    const para = selectParaRepush([
      { key: 'frame_unvalidated', value: '1' },
      { key: 'frame_auto_recharge_seen', value: '0' },
      { key: 'battery', value: '88' }, // sensor-override, not a device param
      { key: 'obstacle_avoidance_sensitivity', value: '2' },
    ]);
    expect(para).toEqual({ obstacle_avoidance_sensitivity: 2 });
    expect(para).not.toHaveProperty('frame_unvalidated');
    expect(para).not.toHaveProperty('frame_auto_recharge_seen');
    expect(para).not.toHaveProperty('battery');
  });

  it('returns null when only non-para keys are present', () => {
    expect(
      selectParaRepush([
        { key: 'frame_unvalidated', value: '1' },
        { key: 'frame_auto_recharge_seen', value: '1' },
      ]),
    ).toBeNull();
  });

  it('keeps non-numeric values as the original string', () => {
    const para = selectParaRepush([{ key: 'path_direction', value: 'auto' }]);
    expect(para).toEqual({ path_direction: 'auto' });
  });

  it('preserves obstacle_avoidance_sensitivity = 0 (a valid chosen value, not "empty")', () => {
    const para = selectParaRepush([{ key: 'obstacle_avoidance_sensitivity', value: '0' }]);
    expect(para).toEqual({ obstacle_avoidance_sensitivity: 0 });
  });
});
