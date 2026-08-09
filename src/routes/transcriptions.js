'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateJwt } = require('../services/vonage');

const router = express.Router();

// Ensure transcriptions/ directory exists
const transcriptionsDir = path.join(__dirname, '..', '..', 'transcriptions');
if (!fs.existsSync(transcriptionsDir)) {
  fs.mkdirSync(transcriptionsDir, { recursive: true });
}

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

    // Acknowledge immediately, download asynchronously
    res.status(200).end();

    downloadTranscription(transcription_url, conversation_uuid, provider).catch((err) => {
      console.error(`[TRANSCRIPTION] Download error: ${err.message}`);
    });
    return;
  }

  if (status === 'transcription_failed') {
    console.error('[TRANSCRIPTION] Failed:');
    console.error(`  conversation_uuid: ${conversation_uuid}`);
    console.error(`  recording_uuid: ${recording_uuid}`);
    console.error(`  provider: ${provider || 'vonage (built-in)'}`);
    console.error(`  error: ${error || 'unknown'}`);
  } else {
    console.log(`[TRANSCRIPTION] Received event with status: ${status}`, req.body);
  }

  res.status(200).end();
});

/**
 * Download a transcription from Vonage using JWT authentication.
 * @param {string} transcriptionUrl - The URL to download the transcription from.
 * @param {string} conversationUuid - The conversation UUID for the filename.
 * @param {string} [provider] - The transcription provider (affects file extension).
 */
async function downloadTranscription(transcriptionUrl, conversationUuid, provider) {
  const https = require('https');
  const token = generateJwt();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const providerSuffix = provider ? `_${provider}` : '_vonage';
  const filename = `${timestamp}_${conversationUuid}${providerSuffix}.json`;
  const filePath = path.join(transcriptionsDir, filename);

  return new Promise((resolve, reject) => {
    const url = new URL(transcriptionUrl);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    const req = https.request(options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Transcription download failed with status ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        fs.writeFile(filePath, data, (err) => {
          if (err) {
            reject(err);
            return;
          }
          console.log(`[TRANSCRIPTION] Saved to: ${filePath}`);
          resolve(filePath);
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { router, downloadTranscription };
