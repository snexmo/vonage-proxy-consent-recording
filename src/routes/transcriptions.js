'use strict';

const express = require('express');

const router = express.Router();

/**
 * POST /transcriptions — Receive transcription completion webhooks.
 *
 * When a transcription completes (or fails), Vonage POSTs to this endpoint
 * with metadata including the transcription_url where the full transcript
 * can be downloaded using JWT authentication.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ IMPORTANT NOTES                                                         │
 * │                                                                         │
 * │ • For third-party providers (Deepgram, AWS), the raw, UNMODIFIED        │
 * │   provider JSON response is served at transcription_url. Vonage         │
 * │   performs NO remapping of the response format.                          │
 * │                                                                         │
 * │ • Fetch the transcript from transcription_url using a JWT signed by     │
 * │   your application's private key (same auth as recording downloads).    │
 * │                                                                         │
 * │ • A maximum 2-hour transcription limit applies across all providers.    │
 * │                                                                         │
 * │ • On failure, status will be "transcription_failed" with an error field.│
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Expected webhook payload:
 * {
 *   "conversation_uuid": "CON-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
 *   "recording_uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
 *   "status": "transcribed",
 *   "transcription_url": "https://api.nexmo.com/v1/files/xxxxxxxx",
 *   "provider": "aws",       // only for third-party providers
 *   "type": "record"
 * }
 */
router.post('/', (req, res) => {
  const {
    conversation_uuid,
    recording_uuid,
    status,
    transcription_url,
    provider,
    type,
    error,
  } = req.body;

  if (status === 'transcribed') {
    console.log('[TRANSCRIPTION] Completed successfully:');
    console.log(`  conversation_uuid: ${conversation_uuid}`);
    console.log(`  recording_uuid: ${recording_uuid}`);
    console.log(`  provider: ${provider || 'vonage (built-in)'}`);
    console.log(`  type: ${type}`);
    console.log(`  transcription_url: ${transcription_url}`);
    console.log('  → Fetch transcript using JWT-authenticated GET to transcription_url');
  } else if (status === 'transcription_failed') {
    console.error('[TRANSCRIPTION] Failed:');
    console.error(`  conversation_uuid: ${conversation_uuid}`);
    console.error(`  recording_uuid: ${recording_uuid}`);
    console.error(`  provider: ${provider || 'vonage (built-in)'}`);
    console.error(`  error: ${error || 'unknown'}`);
  } else {
    console.log(`[TRANSCRIPTION] Received event with status: ${status}`, req.body);
  }

  // Always acknowledge receipt
  res.status(200).end();
});

module.exports = router;
