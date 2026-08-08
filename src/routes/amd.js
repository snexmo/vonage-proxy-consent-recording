'use strict';

const express = require('express');
const { buildScreenerTalkAction } = require('../services/tts');

const router = express.Router();

/**
 * POST /events/amd — Advanced Machine Detection event handler.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ALPHA FEATURE — Call Screener Navigator (APIDOC-2304)                   │
 * │                                                                         │
 * │ Call Screener is an extension to Advanced Machine Detection (AMD) that  │
 * │ handles iOS 18+ Siri call screening and similar automated gatekeepers   │
 * │ before a human answers. When enabled with `callScreener: true` on the   │
 * │ connect action's advancedMachineDetection config:                       │
 * │                                                                         │
 * │ Constraints:                                                            │
 * │   • ONLY valid with mode: "default" AND behavior: "continue"            │
 * │   • CANNOT be combined with mode: "detect" or "detect_beep"             │
 * │   • CANNOT be combined with behavior: "hangup"                          │
 * │   • Billed as AMD TWICE (once for screening, once for final detection)  │
 * │                                                                         │
 * │ When the screener answers, the platform sends a webhook with            │
 * │ sub_state: "screener". Respond with a talk/stream action to play a      │
 * │ message to the screener (e.g., to convince Siri to pass the call).      │
 * │                                                                         │
 * │ Status: Dark-deployed in production. Documentation pending (APIDOC-2304)│
 * │ Confirm GA status with the Voice team before using in production.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Webhook sub-states:
 *   - "screener"          → Siri / screener answered the call
 *   - "screener_message"  → Your audio is actively playing to the screener
 *   - "human_answered"    → Human picked up after screening passed
 *   - "machine"           → Voicemail detected (post-screening or direct)
 *   - "machine_with_beep" → Voicemail beep detected
 *   - "unknown"           → Call may have dropped during screening
 */
router.post('/', (req, res) => {
  const event = req.body;
  const subState = event.sub_state;
  const status = event.status;

  console.log(`[AMD] status=${status}, sub_state=${subState || 'none'}`, event);

  // ─── Call Screener: Siri / automated gatekeeper answered ───────────────
  // Respond with a French message to convince the screener to pass the call.
  // This message plays TO THE SCREENER (not to the human).
  if (subState === 'screener') {
    console.log('[AMD/SCREENER] Screener detected — sending pass-through message');

    // The screener talk action uses Standard French TTS (exempt from voice tier selection)
    const screenerNcco = [buildScreenerTalkAction()];
    return res.status(200).json(screenerNcco);
  }

  // ─── Screener message is playing ──────────────────────────────────────
  if (subState === 'screener_message') {
    console.log('[AMD/SCREENER] Message is playing to screener');
    return res.status(204).end();
  }

  // ─── Human answered (after screening passed) ──────────────────────────
  if (subState === 'human_answered') {
    console.log('[AMD] Human answered after call screening');
    return res.status(204).end();
  }

  // ─── Voicemail detected ───────────────────────────────────────────────
  if (status === 'machine' || subState === 'machine' || subState === 'machine_with_beep') {
    console.warn('[AMD] Voicemail/machine detected — call will continue per behavior: "continue"');
    return res.status(204).end();
  }

  // ─── Unknown state (call may have dropped) ────────────────────────────
  if (subState === 'unknown') {
    console.warn('[AMD] Unknown sub_state — call may have dropped during screening');
    return res.status(204).end();
  }

  // ─── Standard AMD events (human detected, etc.) ───────────────────────
  if (status === 'human') {
    console.log('[AMD] Human detected (no screener involved)');
    return res.status(204).end();
  }

  // ─── Default: acknowledge event ───────────────────────────────────────
  return res.status(204).end();
});

module.exports = router;
