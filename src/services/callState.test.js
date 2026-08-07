'use strict';

const { storeHcpConversationUuid, getHcpConversationUuid, clear } = require('./callState');

describe('callState', () => {
  afterEach(() => {
    clear();
  });

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

  test('clear resets the store to null', () => {
    storeHcpConversationUuid('call-uuid-1', 'CON-abc123');
    clear();
    expect(getHcpConversationUuid()).toBeNull();
  });
});
