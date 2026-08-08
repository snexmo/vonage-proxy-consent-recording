'use strict';

const {
  storeHcpConversationUuid,
  getHcpConversationUuid,
  getHcpCallUuid,
  storeCallOptions,
  getCallOptions,
  clear,
} = require('./callState');

describe('callState', () => {
  afterEach(() => {
    clear();
  });

  describe('HCP conversation UUID', () => {
    test('returns null when no UUID has been stored', () => {
      expect(getHcpConversationUuid()).toBeNull();
    });

    test('stores and retrieves an HCP conversation UUID', () => {
      storeHcpConversationUuid('call-uuid-1', 'CON-abc123');
      expect(getHcpConversationUuid()).toBe('CON-abc123');
    });

    test('returns the most recently stored UUID', () => {
      storeHcpConversationUuid('call-uuid-1', 'CON-first');
      storeHcpConversationUuid('call-uuid-2', 'CON-second');
      expect(getHcpConversationUuid()).toBe('CON-second');
    });
  });

  describe('HCP call UUID', () => {
    test('returns null when no call UUID has been stored', () => {
      expect(getHcpCallUuid()).toBeNull();
    });

    test('stores and retrieves the HCP call UUID', () => {
      storeHcpConversationUuid('call-uuid-abc', 'CON-xyz');
      expect(getHcpCallUuid()).toBe('call-uuid-abc');
    });

    test('returns the most recently stored call UUID', () => {
      storeHcpConversationUuid('call-1', 'CON-1');
      storeHcpConversationUuid('call-2', 'CON-2');
      expect(getHcpCallUuid()).toBe('call-2');
    });
  });

  describe('Call options', () => {
    test('returns null when no options have been stored', () => {
      expect(getCallOptions()).toBeNull();
    });

    test('stores and retrieves call options', () => {
      const options = {
        voiceTier: 'premier',
        transcriptionProvider: 'deepgram',
        amdEnabled: true,
      };
      storeCallOptions(options);
      expect(getCallOptions()).toEqual(options);
    });

    test('stores a copy (not a reference) of options', () => {
      const options = { voiceTier: 'standard', transcriptionProvider: 'none', amdEnabled: false };
      storeCallOptions(options);
      options.voiceTier = 'premier'; // mutate original
      expect(getCallOptions().voiceTier).toBe('standard'); // stored copy unchanged
    });

    test('overwrites previous options', () => {
      storeCallOptions({ voiceTier: 'standard', transcriptionProvider: 'none', amdEnabled: false });
      storeCallOptions({ voiceTier: 'premier', transcriptionProvider: 'aws', amdEnabled: true });
      expect(getCallOptions()).toEqual({
        voiceTier: 'premier',
        transcriptionProvider: 'aws',
        amdEnabled: true,
      });
    });
  });

  describe('clear', () => {
    test('resets all state to null', () => {
      storeHcpConversationUuid('call-1', 'CON-1');
      storeCallOptions({ voiceTier: 'standard', transcriptionProvider: 'none', amdEnabled: true });

      clear();

      expect(getHcpConversationUuid()).toBeNull();
      expect(getHcpCallUuid()).toBeNull();
      expect(getCallOptions()).toBeNull();
    });
  });
});
