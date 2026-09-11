import { describe, it, expect } from 'vitest';
import { countdownLabel } from './arrivals';

const now = 1789125480;

describe('countdownLabel', () => {
  it('counts the minutes down', () => {
    expect(countdownLabel(now + 300, now)).toBe('5min');
    expect(countdownLabel(now + 60, now)).toBe('1min');
  });

  it('says now while the bus is arriving', () => {
    expect(countdownLabel(now + 10, now)).toBe('Agora');
    expect(countdownLabel(now, now)).toBe('Agora');
  });

  it('keeps saying now when the time ran out and the bus has not gone by', () => {
    expect(countdownLabel(now - 120, now)).toBe('Agora');
    expect(countdownLabel(now - 600, now)).toBe('Agora');
  });

  it('splits the hours out', () => {
    expect(countdownLabel(now + 3600, now)).toBe('1h');
    expect(countdownLabel(now + 3600 + 900, now)).toBe('1h15');
  });
});
