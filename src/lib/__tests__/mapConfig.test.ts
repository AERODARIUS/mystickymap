import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_MAP_ID, resolveMapId } from '../mapConfig';

describe('resolveMapId', () => {
  it('returns the configured Cloud Map ID when provided', () => {
    expect(resolveMapId('8e0a97af9386fef')).toBe('8e0a97af9386fef');
    expect(resolveMapId('  a1b2c3d4e5f6  ')).toBe('a1b2c3d4e5f6');
  });

  it('falls back to DEMO_MAP_ID when unset or placeholder', () => {
    expect(resolveMapId(undefined)).toBe(DEFAULT_DEMO_MAP_ID);
    expect(resolveMapId(null)).toBe(DEFAULT_DEMO_MAP_ID);
    expect(resolveMapId('')).toBe(DEFAULT_DEMO_MAP_ID);
    expect(resolveMapId('   ')).toBe(DEFAULT_DEMO_MAP_ID);
    expect(resolveMapId('YOUR_MAP_ID')).toBe(DEFAULT_DEMO_MAP_ID);
    expect(resolveMapId('undefined')).toBe(DEFAULT_DEMO_MAP_ID);
    expect(resolveMapId('null')).toBe(DEFAULT_DEMO_MAP_ID);
  });
});
