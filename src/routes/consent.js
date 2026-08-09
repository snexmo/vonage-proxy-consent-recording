'use strict';

const express = require('express');
const { BASE_URL, TRANSCRIPTION_LANGUAGE } = require('../config');
const { startRecording } = require('../services/vonage');
const { getHcpCallUuid, getHcpConversationUuid, getCallOptions } = require('../services/callState');
const { buildTalkAction } = require('../services/tts');
const { buildTranscriptionConfigRest } = require('../services/transcription');

const router = express.Router();

/**
 * POST /consent — Handle patient DTMF input and return conditional NCCO.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ RECORDING APPROACH: REST API (Conversations API)                        │
 * │                                                                         │
 * │ On consent (press 1):                                                   │
 * │   1. Start recording on the HCP conversation via REST API               │
 * │   2. Return a talk NCCO confirming consent                              │
 * │                                                                         │
 * │ On refusal (press 2 / timeout / other):                                 │
 * │   Return talk-only NCCO — no API calls made.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
router.post('/', async (req, res) => {
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

    const hcpConversationUuid = getHcpConversationUuid();
    const hcpCallUuid = getHcpCallUuid();

    console.log(`[CONSENT] HCP conversation UUID: ${hcpConversationUuid}, HCP call UUID: ${hcpCallUuid}`);

    // Build transcription config for the REST API (snake_case keys)
    const transcriptionConfig = buildTranscriptionConfigRest(
      callOptions.transcriptionProvider,
      `${BASE_URL}/transcriptions`,
      TRANSCRIPTION_LANGUAGE
    );

    // Start recording on the HCP conversation via REST API
    const eventUrl = `${BASE_URL}/recordings`;
    try {
      await startRecording(hcpConversationUuid, eventUrl, transcriptionConfig);
      console.log(`[CONSENT] Recording started on conversation: ${hcpConversationUuid}`);
    } catch (err) {
      console.error(`[CONSENT] Failed to start recording: ${err.message}`);
    }

    // Build TTS confirmation
    const talkAction = buildTalkAction(
      'Merci. Vous allez être mis en relation avec votre médecin.',
      callOptions.voiceTier
    );

    const ncco = [talkAction];
    console.log('[CONSENT] Returning NCCO:', JSON.stringify(ncco, null, 2));
    res.json(ncco);

    return;
  }

  // ─── Consent refused: digit "2", timeout, or any other value ───────────
  const reason = timedOut
    ? 'timeout'
    : digits === '2'
      ? 'pressed 2'
      : `unexpected digit "${digits}"`;

  console.log(`[CONSENT REFUSED] conversation_uuid=${conversation_uuid} — Reason: ${reason}. No recording.`);

  const talkAction = buildTalkAction(
    'Nous avons tenu compte de votre choix de ne pas enregistrer. Vous allez être mis en relation avec votre médecin.',
    callOptions.voiceTier
  );

  return res.json([talkAction]);
});

module.exports = router;
