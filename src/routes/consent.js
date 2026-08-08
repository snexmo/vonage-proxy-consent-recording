'use strict';

const express = require('express');
const { BASE_URL, TRANSCRIPTION_LANGUAGE } = require('../config');
const { transferCall } = require('../services/vonage');
const { getHcpCallUuid, getCallOptions } = require('../services/callState');
const { buildTalkAction } = require('../services/tts');
const { buildTranscriptionConfig } = require('../services/transcription');

const router = express.Router();

/**
 * POST /consent — Handle patient DTMF input and return conditional NCCO.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ RECORDING APPROACH: Named Conversation                                  │
 * │                                                                         │
 * │ Why not use `record` action directly in this NCCO?                      │
 * │ The patient's onAnswer NCCO runs in a TEMPORARY conversation that       │
 * │ terminates when the patient bridges into the HCP's conversation.        │
 * │ A `record` action here would only capture audio from that temporary     │
 * │ leg — not the actual HCP-patient conversation.                          │
 * │                                                                         │
 * │ Solution: Use a NAMED conversation with `record: true`.                 │
 * │ 1. Patient joins a new named conversation (with recording enabled)      │
 * │ 2. HCP is transferred into the same named conversation via REST API     │
 * │ 3. Both legs are now in a recorded conversation — recording captures    │
 * │    the full HCP-patient interaction from the moment consent is given    │
 * │                                                                         │
 * │ The REST API call (PUT /v1/calls/{uuid}) is ONLY used for the           │
 * │ transfer — recording itself is configured via the NCCO `conversation`   │
 * │ action with `record: true` and `transcription` settings.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
router.post('/', (req, res) => {
  const { dtmf, conversation_uuid } = req.body;
  const digits = dtmf && dtmf.digits;
  const timedOut = dtmf && dtmf.timed_out;

  // Retrieve per-call options set during call initiation
  const callOptions = getCallOptions() || {
    voiceTier: 'standard',
    transcriptionProvider: 'none',
  };

  if (digits === '1') {
    console.log(`[CONSENT GRANTED] conversation_uuid=${conversation_uuid} — Patient pressed 1, recording enabled.`);

    // Use the HCP call UUID as the named conversation identifier.
    // This UUID is unique per call and already available — no need to generate
    // a random name. Both the patient and HCP will join this conversation.
    const hcpCallUuid = getHcpCallUuid();
    const conversationName = hcpCallUuid;
    console.log(`[CONSENT] Recording conversation name: ${conversationName}`);

    // Build the TTS confirmation using the selected voice tier
    const talkAction = buildTalkAction(
      'Merci. Vous allez être mis en relation avec votre médecin.',
      callOptions.voiceTier
    );

    // Build transcription config (null if provider is "none")
    const transcriptionConfig = buildTranscriptionConfig(
      callOptions.transcriptionProvider,
      `${BASE_URL}/transcriptions`,
      TRANSCRIPTION_LANGUAGE
    );

    // ─── Build the conversation action ─────────────────────────────────────
    // The patient joins this named conversation. Recording starts here — at
    // the exact moment consent is granted.
    // The HCP will be transferred into the same conversation (see below).
    //
    // endOnExit: true ensures the call ends when either party hangs up.
    const conversationAction = {
      action: 'conversation',
      name: conversationName,
      record: true,
      startOnEnter: true,
      endOnExit: true,
    };

    // Attach transcription settings if a provider was selected
    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ ALPHA: Third-party transcription (Deepgram/AWS) via provider +      │
    // │ providerOptions on the transcription object. When set, Vonage       │
    // │ routes the recording to the third-party provider and delivers the   │
    // │ raw, unmodified provider response to your transcription.eventUrl.   │
    // │ Status: APIVOICEF-755 (Q3 2026 PI)                                 │
    // └─────────────────────────────────────────────────────────────────────┘
    if (transcriptionConfig) {
      conversationAction.transcription = transcriptionConfig;
    }

    const ncco = [talkAction, conversationAction];
    res.json(ncco);

    // ─── Fire-and-forget: Transfer HCP leg into the recorded conversation ──
    // This moves the HCP from their original connect-based conversation into
    // the named recorded conversation. Both parties are now in the same
    // conversation with recording active.
    if (!hcpCallUuid) {
      console.warn('[CONSENT] No HCP call UUID available — cannot transfer HCP to recorded conversation');
    } else {
      const hcpNcco = [
        {
          action: 'conversation',
          name: conversationName,
          startOnEnter: true,
          endOnExit: true,
        },
      ];

      transferCall(hcpCallUuid, hcpNcco)
        .then(() => console.log(`[TRANSFER] HCP (${hcpCallUuid}) transferred to conversation: ${conversationName}`))
        .catch((err) => console.error(`[TRANSFER ERROR] ${err.message}`));
    }

    return;
  }

  // ─── Consent refused: digit "2", timeout, or any other value ───────────
  const reason = timedOut
    ? 'timeout'
    : digits === '2'
      ? 'pressed 2'
      : `unexpected digit "${digits}"`;

  console.log(`[CONSENT REFUSED] conversation_uuid=${conversation_uuid} — Reason: ${reason}. No recording.`);

  // Patient auto-bridges back to HCP conversation (no recording, no transfer)
  const talkAction = buildTalkAction(
    'Nous avons tenu compte de votre choix de ne pas enregistrer. Vous allez être mis en relation avec votre médecin.',
    callOptions.voiceTier
  );

  return res.json([talkAction]);
});

module.exports = router;
