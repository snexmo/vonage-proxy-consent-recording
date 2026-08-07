'use strict';

const fc = require('fast-check');
const { storeHcpConversationUuid, getHcpConversationUuid, clear } = require('./callState');

/**
 * Property 5: Conversation UUID round-trip (store then retrieve)
 *
 * For any call UUID and conversation UUID pair, storing the HCP conversation UUID
 * and then retrieving it SHALL yield the same conversation UUID that was stored.
 *
 * Validates: Requirements 3.1, 3.2
 */
describe('callState property tests', () => {
  afterEach(() => {
    clear();
  });

  it('Property 5: storing then retrieving yields the same conversation UUID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (callUuid, conversationUuid) => {
          clear();
          storeHcpConversationUuid(callUuid, conversationUuid);
          const retrieved = getHcpConversationUuid();
          return retrieved === conversationUuid;
        }
      ),
      { numRuns: 100 }
    );
  });
});
