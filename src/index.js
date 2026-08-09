'use strict';

const express = require('express');
const path = require('path');
const readline = require('readline');
const config = require('./config');
const { createCall } = require('./services/vonage');
const { storeHcpConversationUuid, storeCallOptions } = require('./services/callState');
const { buildTalkAction } = require('./services/tts');
const { buildAmdConfig } = require('./services/amd');

// Route modules
const nccoRouter = require('./routes/ncco');
const consentRouter = require('./routes/consent');
const { router: recordingsRouter } = require('./routes/recordings');
const { router: transcriptionsRouter } = require('./routes/transcriptions');
const eventsRouter = require('./routes/events');
const amdRouter = require('./routes/amd');

const app = express();

// Middleware
app.use(express.json());

// Serve static files from public/ (e.g. /audio/hold-music.mp3)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount routes
app.use('/', nccoRouter);             // defines /ncco/patient
app.use('/consent', consentRouter);    // POST /consent
app.use('/recordings', recordingsRouter); // POST /recordings
app.use('/transcriptions', transcriptionsRouter); // POST /transcriptions
app.use('/events', eventsRouter);      // POST /events, /events/connect
app.use('/events/amd', amdRouter);     // POST /events/amd (AMD + Call Screener)

// Start the server
const server = app.listen(config.PORT, () => {
  console.log(`\n[SERVER] Listening on port ${config.PORT}`);
  console.log(`[SERVER] BASE_URL: ${config.BASE_URL}`);
  console.log('[SERVER] Registered endpoints:');
  console.log('  GET/POST /ncco/patient');
  console.log('  POST     /consent');
  console.log('  POST     /recordings');
  console.log('  POST     /transcriptions');
  console.log('  POST     /events');
  console.log('  POST     /events/connect');
  console.log('  POST     /events/amd');
  console.log('  STATIC   /audio/*');
  console.log('');

  promptForCall();
});

/**
 * Validate E.164 phone number format: starts with +, followed by digits only.
 */
function isValidE164(number) {
  return /^\+\d+$/.test(number);
}

/**
 * Normalize phone number input to E.164 format.
 * If the input is all digits (no +), prepend a +.
 * Otherwise leave it as-is.
 */
function normalizeE164(input) {
  if (/^\d+$/.test(input)) {
    return '+' + input;
  }
  return input;
}

/**
 * Prompt the operator for call configuration and initiate the call.
 *
 * Prompts:
 *   1. HCP phone number
 *   2. Patient phone number
 *   3. TTS voice tier (Standard / Premium / Premier)
 *   4. Transcription provider (None / Vonage / Deepgram / AWS)
 *   5. AMD + Call Screener toggle (Y/n)
 */
function promptForCall() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // ─── Step 1: HCP phone number ───────────────────────────────────────────
  const defaultHcpDisplay = config.DEFAULT_HCP_NUMBER ? ` [${config.DEFAULT_HCP_NUMBER}]` : '';
  rl.question(`Enter HCP phone number (E.164)${defaultHcpDisplay}: `, (hcpInput) => {
    hcpInput = hcpInput.trim();
    const hcpNumber = hcpInput === '' ? config.DEFAULT_HCP_NUMBER : normalizeE164(hcpInput);

    if (!hcpNumber) {
      console.log('No phone number provided and no default configured.');
      rl.close();
      promptForCall();
      return;
    }

    if (hcpInput !== '' && !isValidE164(hcpNumber)) {
      console.log('Invalid phone number. Must start with + followed by digits only.');
      rl.close();
      promptForCall();
      return;
    }

    // ─── Step 2: Patient phone number ───────────────────────────────────────
    const defaultPatientDisplay = config.DEFAULT_PATIENT_NUMBER ? ` [${config.DEFAULT_PATIENT_NUMBER}]` : '';
    rl.question(`Enter Patient phone number (E.164)${defaultPatientDisplay}: `, (patientInput) => {
      patientInput = patientInput.trim();
      const patientNumber = patientInput === '' ? config.DEFAULT_PATIENT_NUMBER : normalizeE164(patientInput);

      if (!patientNumber) {
        console.log('No phone number provided and no default configured.');
        rl.close();
        promptForCall();
        return;
      }

      if (patientInput !== '' && !isValidE164(patientNumber)) {
        console.log('Invalid phone number. Must start with + followed by digits only.');
        rl.close();
        promptForCall();
        return;
      }

      // ─── Step 3: TTS voice tier ──────────────────────────────────────────
      console.log('\nTTS Voice Tier:');
      console.log('  1) Standard (default)');
      console.log('  2) Premium');
      console.log('  3) Premier (Google Chirp3 HD) — NEW');
      rl.question('Select TTS voice [1]: ', (ttsInput) => {
        ttsInput = ttsInput.trim();
        let voiceTier;
        switch (ttsInput) {
          case '2': voiceTier = 'premium'; break;
          case '3': voiceTier = 'premier'; break;
          default: voiceTier = 'standard'; break;
        }

        // ─── Step 4: Transcription provider ────────────────────────────────
        console.log('\nPost-Call Transcription Provider:');
        console.log('  1) None (default)');
        console.log('  2) Vonage (built-in)');
        console.log('  3) ✗ Deepgram Standard (nova-2-phonecall) — future platform release');
        console.log('  4) ✗ Deepgram Medical (nova-3-medical) — future platform release');
        console.log('  5) ✗ AWS Transcribe — future platform release');
        rl.question('Select transcription provider [1]: ', (txInput) => {
          txInput = txInput.trim();
          let transcriptionProvider;
          switch (txInput) {
            case '2': transcriptionProvider = 'vonage'; break;
            // ─── Coming in a future release (requires NCCO-based recording path) ───
            // case '3': transcriptionProvider = 'deepgram'; break;
            // case '4': transcriptionProvider = 'deepgram-medical'; break;
            // case '5': transcriptionProvider = 'aws'; break;
            default: transcriptionProvider = 'none'; break;
          }

          // ─── Step 5: AMD + Call Screener toggle ──────────────────────────
          // ┌─────────────────────────────────────────────────────────────────┐
          // │ ALPHA: Call Screener Navigator (APIDOC-2304)                    │
          // │ Handles iOS 18+ Siri call screening on the patient's phone.    │
          // │ Default: ON                                                     │
          // └─────────────────────────────────────────────────────────────────┘
          rl.question('\nEnable AMD + Call Screener? [Y/n]: ', async (amdInput) => {
            amdInput = amdInput.trim().toLowerCase();
            const amdEnabled = amdInput !== 'n' && amdInput !== 'no';

            rl.close();

            // Store per-call options for use by consent handler and NCCO routes
            storeCallOptions({ voiceTier, transcriptionProvider, amdEnabled });

            // Build the inline NCCO for the HCP leg
            const ncco = buildHcpNcco(patientNumber, voiceTier, amdEnabled);

            // Log configuration
            console.log(`\n[CALL] Initiating proxy call...`);
            console.log(`[CALL] HCP: ${hcpNumber} (from ${config.LVN_A})`);
            console.log(`[CALL] Patient: ${patientNumber} (from ${config.LVN_B})`);
            console.log(`[CALL] TTS: ${voiceTier}`);
            console.log(`[CALL] Transcription: ${transcriptionProvider}`);
            console.log(`[CALL] AMD + Call Screener: ${amdEnabled ? 'ON' : 'OFF'}`);

            try {
              const result = await createCall(ncco, hcpNumber, config.LVN_A, `${config.BASE_URL}/events`);
              console.log(`[CALL] Success! Call UUID: ${result.uuid}`);
              storeHcpConversationUuid(result.uuid, result.conversation_uuid);
              console.log(`[CALL] HCP Conversation UUID: ${result.conversation_uuid}`);
            } catch (err) {
              console.error(`[CALL] Error: ${err.message}`);
            }

            // Prompt again for another call
            console.log('');
            promptForCall();
          });
        });
      });
    });
  });
}

/**
 * Build the inline NCCO for the HCP leg.
 *
 * Structure:
 *   [talk (hold message), connect (to patient)]
 *
 * The connect action includes:
 *   - onAnswer: serves the consent NCCO to the patient
 *   - ringbackTone: hold music for the HCP while patient goes through consent
 *   - advancedMachineDetection: (optional) AMD + Call Screener config
 *
 * @param {string} patientNumber - Patient phone number (E.164)
 * @param {string} voiceTier - TTS voice tier for the hold message
 * @param {boolean} amdEnabled - Whether AMD + Call Screener is enabled
 * @returns {Array} NCCO actions array
 */
function buildHcpNcco(patientNumber, voiceTier, amdEnabled) {
  // HCP hears a brief hold message using the selected voice tier
  const talkAction = buildTalkAction(
    'Veuillez patienter pendant que nous mettons le patient en ligne.',
    voiceTier
  );

  // Build the connect action to dial the patient
  const connectAction = {
    action: 'connect',
    from: config.LVN_B,
    endpoint: [
      {
        type: 'phone',
        number: patientNumber,
        onAnswer: {
          url: `${config.BASE_URL}/ncco/patient`,
          ringbackTone: `${config.BASE_URL}/audio/hold-music.mp3`,
        },
      },
    ],
    eventUrl: [`${config.BASE_URL}/events/connect`],
  };

  // ─── Add AMD + Call Screener if enabled ───────────────────────────────────
  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ ALPHA: Advanced Machine Detection with Call Screener Navigator          │
  // │                                                                         │
  // │ When enabled, the connect action includes advancedMachineDetection      │
  // │ with callScreener: true. This handles iOS 18+ Siri screening and        │
  // │ similar automated gatekeepers before the human answers.                 │
  // │                                                                         │
  // │ AMD events are sent to /events/amd which handles the screener           │
  // │ sub-states and returns appropriate NCCOs to play to the screener.       │
  // │                                                                         │
  // │ Note: When AMD is enabled, the eventUrl for AMD events is separate      │
  // │ from the connect eventUrl. AMD uses the call-level event_url by         │
  // │ default (set on createCall). We override by setting eventUrl on the     │
  // │ connect action to point to /events/amd for AMD-specific handling.       │
  // │                                                                         │
  // │ Constraints:                                                            │
  // │   • callScreener requires mode: "default" + behavior: "continue"        │
  // │   • Billed as AMD twice (screening + final detection)                   │
  // │   • Status: Dark-deployed (APIDOC-2304)                                 │
  // └─────────────────────────────────────────────────────────────────────────┘
  const amdConfig = buildAmdConfig(amdEnabled);
  if (amdConfig) {
    connectAction.advancedMachineDetection = amdConfig;
    // Point the connect eventUrl to the AMD handler for machine detection events
    connectAction.eventUrl = [`${config.BASE_URL}/events/amd`];
  }

  return [talkAction, connectAction];
}

module.exports = { app, server, isValidE164, normalizeE164, buildHcpNcco };
