import { describe, test, expect } from 'vitest';
import { floodZoneInfo } from '../floodZone.js';

describe('floodZoneInfo', () => {
  test('null zone → returns null', () => {
    expect(floodZoneInfo(null)).toBeNull();
  });

  test('undefined zone → returns null', () => {
    expect(floodZoneInfo(undefined)).toBeNull();
  });

  test('empty string → returns null', () => {
    expect(floodZoneInfo('')).toBeNull();
  });

  test('Zone X → low risk, no flag', () => {
    const r = floodZoneInfo('X');
    expect(r.risk).toBe('low');
    expect(r.flagSeverity).toBeNull();
  });

  test('Zone X500 → low risk (same as X)', () => {
    const r = floodZoneInfo('X500');
    expect(r.risk).toBe('low');
  });

  test('Zone AE → high risk, warning flag', () => {
    const r = floodZoneInfo('AE');
    expect(r.risk).toBe('high');
    expect(r.flagSeverity).toBe('warning');
  });

  test('Zone A → high risk (any A-prefix)', () => {
    const r = floodZoneInfo('A');
    expect(r.risk).toBe('high');
    expect(r.flagSeverity).toBe('warning');
  });

  test('Zone VE → critical risk, critical flag', () => {
    const r = floodZoneInfo('VE');
    expect(r.risk).toBe('critical');
    expect(r.flagSeverity).toBe('critical');
  });

  test('Zone V → critical risk', () => {
    const r = floodZoneInfo('V');
    expect(r.risk).toBe('critical');
    expect(r.flagSeverity).toBe('critical');
  });

  test('Zone D → unknown risk, no flag', () => {
    const r = floodZoneInfo('D');
    expect(r.risk).toBe('unknown');
    expect(r.flagSeverity).toBeNull();
  });

  test('Zone B → moderate risk (default), no flag', () => {
    const r = floodZoneInfo('B');
    expect(r.risk).toBe('moderate');
    expect(r.flagSeverity).toBeNull();
  });

  test('lowercase input normalized → ae returns high risk', () => {
    const r = floodZoneInfo('ae');
    expect(r.risk).toBe('high');
  });

  test('every result includes label, color, bg, desc', () => {
    for (const zone of ['X', 'AE', 'VE', 'D', 'B']) {
      const r = floodZoneInfo(zone);
      expect(r.label).toBeTruthy();
      expect(r.color).toBeTruthy();
      expect(r.bg).toBeTruthy();
      expect(r.desc).toBeTruthy();
    }
  });
});
