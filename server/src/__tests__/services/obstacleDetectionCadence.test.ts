import { describe, it, expect } from 'vitest';
import { selectObstacleDetectionLevel } from '../../services/obstacleDetectionCadence.js';

describe('selectObstacleDetectionLevel', () => {
  it('returns the stored obstacle_avoidance_sensitivity as a number', () => {
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '2' }])).toBe(2);
  });

  it('clamps out-of-range values into 1..3', () => {
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '9' }])).toBe(3);
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '0' }])).toBe(1);
  });

  it('returns null when the key is absent', () => {
    expect(selectObstacleDetectionLevel([{ key: 'headlight', value: '5' }])).toBeNull();
  });

  it('returns null when the value is not a finite number', () => {
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '' }])).toBeNull();
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: 'x' }])).toBeNull();
  });
});
