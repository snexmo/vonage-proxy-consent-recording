'use strict';

/**
 * In-memory call state store.
 *
 * Tracks per-call state including:
 *   - HCP call UUID (used as the named conversation identifier for recording,
 *     and needed for REST API transfer into that conversation)
 *   - HCP conversation UUID
 *   - Per-call options (voiceTier, transcriptionProvider, amdEnabled)
 *
 * This uses a single-call-at-a-time model for simplicity (demo/reference code).
 */
const callState = new Map();

// Track the "current" call state for single-call model
let currentHcpCallUuid = null;
let currentHcpConversationUuid = null;
let currentCallOptions = null;

/**
 * Store the HCP call and conversation UUIDs for a call.
 * The call UUID is reused as the named conversation identifier when
 * recording is enabled — it is already unique per call.
 * @param {string} callUuid - The call UUID returned by createCall.
 * @param {string} conversationUuid - The HCP conversation UUID.
 */
function storeHcpConversationUuid(callUuid, conversationUuid) {
  callState.set(callUuid, { conversationUuid, storedAt: Date.now() });
  currentHcpCallUuid = callUuid;
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
 * Retrieve the stored HCP call UUID.
 * This UUID serves two purposes:
 *   1. Transfer the HCP leg via PUT /v1/calls/{callUuid}
 *   2. Used as the named conversation identifier for recording
 * @returns {string|null} The HCP call UUID, or null if not set.
 */
function getHcpCallUuid() {
  return currentHcpCallUuid;
}

/**
 * Store per-call options selected by the operator at CLI prompt time.
 * These options are read by the consent handler and NCCO routes.
 *
 * @param {object} options
 * @param {string} options.voiceTier - "standard", "premium", or "premier"
 * @param {string} options.transcriptionProvider - "vonage", "deepgram", "aws", or "none"
 * @param {boolean} options.amdEnabled - Whether AMD + Call Screener is enabled
 */
function storeCallOptions(options) {
  currentCallOptions = { ...options };
}

/**
 * Retrieve the per-call options for the current call.
 * @returns {object|null} The call options, or null if not set.
 */
function getCallOptions() {
  return currentCallOptions;
}

/**
 * Clear all stored call state. Used in tests and between calls.
 */
function clear() {
  callState.clear();
  currentHcpCallUuid = null;
  currentHcpConversationUuid = null;
  currentCallOptions = null;
}

module.exports = {
  storeHcpConversationUuid,
  getHcpConversationUuid,
  getHcpCallUuid,
  storeCallOptions,
  getCallOptions,
  clear,
};
