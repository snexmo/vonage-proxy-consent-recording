'use strict';

/**
 * AMD (Advanced Machine Detection) + Call Screener Configuration Builder
 *
 * Generates the `advancedMachineDetection` object for the NCCO `connect` action.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ALPHA FEATURE — Call Screener Navigator (APIDOC-2304)                   │
 * │                                                                         │
 * │ `callScreener: true` activates iOS 18+ Siri call screening navigation. │
 * │ When a screener answers, Vonage sends a webhook with sub_state:         │
 * │ "screener" — your app responds with a talk/stream action to play a      │
 * │ message that convinces the screener to pass the call through.           │
 * │                                                                         │
 * │ Constraints:                                                            │
 * │   • ONLY valid with mode: "default" AND behavior: "continue"            │
 * │   • CANNOT use mode: "detect" or "detect_beep" with callScreener       │
 * │   • CANNOT use behavior: "hangup" with callScreener                    │
 * │   • Billed as AMD twice (screening phase + final detection)             │
 * │                                                                         │
 * │ Status: Dark-deployed. Confirm GA before production use.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Build the advancedMachineDetection config for a connect action.
 *
 * @param {boolean} enabled - Whether AMD + Call Screener should be active.
 * @returns {object|null} The advancedMachineDetection config, or null if disabled.
 *
 * @example
 * const amdConfig = buildAmdConfig(true);
 * // => { behavior: 'continue', mode: 'default', beepTimeout: 45, callScreener: true }
 */
function buildAmdConfig(enabled) {
  if (!enabled) {
    return null;
  }

  return {
    // behavior: "continue" — keep the call connected regardless of detection result.
    // Required for callScreener.
    behavior: 'continue',

    // mode: "default" — asynchronous detection. NCCO processing starts immediately
    // while AMD runs in the background. Required for callScreener.
    mode: 'default',

    // beepTimeout: How long (seconds) to wait for a voicemail beep.
    // If no beep is received within this window, a "beep_timeout" sub_state is sent.
    beepTimeout: 45,

    // ─── ALPHA: Call Screener Navigator ───────────────────────────────────
    // Handles iOS 18+ Siri call screening and similar automated gatekeepers.
    // When the screener answers, queue a talk/stream action to play to it.
    callScreener: true,
  };
}

module.exports = { buildAmdConfig };
