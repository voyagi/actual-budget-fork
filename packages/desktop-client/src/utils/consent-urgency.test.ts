import { describe, expect, it } from 'vitest';

import { getUrgencyLevel } from './consent-urgency';

describe('getUrgencyLevel', () => {
  it('returns expired for negative days', () => {
    expect(getUrgencyLevel(-5)).toBe('expired');
  });

  it('returns expired for exactly 0 days', () => {
    expect(getUrgencyLevel(0)).toBe('expired');
  });

  it('returns urgent for 1 day', () => {
    expect(getUrgencyLevel(1)).toBe('urgent');
  });

  it('returns urgent for exactly 7 days', () => {
    expect(getUrgencyLevel(7)).toBe('urgent');
  });

  it('returns soon for 8 days', () => {
    expect(getUrgencyLevel(8)).toBe('soon');
  });

  it('returns soon for exactly 14 days', () => {
    expect(getUrgencyLevel(14)).toBe('soon');
  });

  it('returns ok for 15 days', () => {
    expect(getUrgencyLevel(15)).toBe('ok');
  });

  it('returns ok for large values', () => {
    expect(getUrgencyLevel(365)).toBe('ok');
  });

  it('returns expired for large negative values', () => {
    expect(getUrgencyLevel(-365)).toBe('expired');
  });

  it('handles fractional days correctly', () => {
    expect(getUrgencyLevel(0.5)).toBe('urgent');
    expect(getUrgencyLevel(7.5)).toBe('soon');
    expect(getUrgencyLevel(14.5)).toBe('ok');
    expect(getUrgencyLevel(-0.1)).toBe('expired');
  });
});
