'use strict';

/**
 * In-memory call state store.
 * Tracks HCP conversation UUIDs keyed by call UUID.
 *
 * Key: call UUID (string)
 * Value: { conversationUuid: string, storedAt: number }
 */
const callState = new Map();

// Track the "current" HCP conversation UUID for single-call model
let currentHcpConversationUuid = null;

/**
 * Store the HCP conversation UUID for a call.
 * @param {string} callUuid - The call UUID returned by createCall.
 * @param {string} conversationUuid - The HCP conversation UUID.
 */
function storeHcpConversationUuid(callUuid, conversationUuid) {
  callState.set(callUuid, { conversationUuid, storedAt: Date.now() });
  currentHcpConversationUuid = conversationUuid;
}

/**
 * Retrieve the stored HCP conversation UUID.
 * Returns the most recently stored UUID (single-call-at-a-time model).
 * @returns {string|null} The HCP conversation UUID, or null if not set.
 */
function getHcpConversationUuid() {
  return currentHcpConversationUuid;
}

/**
 * Clear stored call state.
 */
function clear() {
  callState.clear();
  currentHcpConversationUuid = null;
}

module.exports = { storeHcpConversationUuid, getHcpConversationUuid, clear };
