'use strict';

const { buildAmdConfig } = require('./amd');

describe('buildAmdConfig', () => {
  test('returns null when disabled', () => {
    expect(buildAmdConfig(false)).toBeNull();
  });

  test('returns null for falsy values', () => {
    expect(buildAmdConfig(null)).toBeNull();
    expect(buildAmdConfig(undefined)).toBeNull();
    expect(buildAmdConfig(0)).toBeNull();
  });

  test('returns correct config when enabled', () => {
    const config = buildAmdConfig(true);
    expect(config).toEqual({
      behavior: 'continue',
      mode: 'default',
      beepTimeout: 45,
      callScreener: true,
    });
  });

  test('mode is always "default" (required for callScreener)', () => {
    const config = buildAmdConfig(true);
    expect(config.mode).toBe('default');
  });

  test('behavior is always "continue" (required for callScreener)', () => {
    const config = buildAmdConfig(true);
    expect(config.behavior).toBe('continue');
  });

  test('callScreener is always true when enabled', () => {
    const config = buildAmdConfig(true);
    expect(config.callScreener).toBe(true);
  });
});
