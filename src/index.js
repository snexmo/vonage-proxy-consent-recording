const express = require('express');
const path = require('path');
const readline = require('readline');
const config = require('./config');
const { createCall } = require('./services/vonage');
const { storeHcpConversationUuid } = require('./services/callState');

// Route modules
const nccoRouter = require('./routes/ncco');
const consentRouter = require('./routes/consent');
const { router: recordingsRouter } = require('./routes/recordings');
const eventsRouter = require('./routes/events');

const app = express();

// Middleware
app.use(express.json());

// Serve static files from public/ (e.g. /audio/hold-music.mp3)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount routes
app.use('/', nccoRouter);             // defines /ncco/patient
app.use('/consent', consentRouter);    // POST /consent
app.use('/recordings', recordingsRouter); // POST /recordings
app.use('/events', eventsRouter);      // POST /events, /events/connect

// Start the server
const server = app.listen(config.PORT, () => {
  console.log(`\n[SERVER] Listening on port ${config.PORT}`);
  console.log(`[SERVER] BASE_URL: ${config.BASE_URL}`);
  console.log('[SERVER] Registered endpoints:');
  console.log('  GET/POST /ncco/patient');
  console.log('  POST     /consent');
  console.log('  POST     /recordings');
  console.log('  POST     /events');
  console.log('  POST     /events/connect');
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
 * Prompt the operator for HCP and patient phone numbers, then initiate the call.
 */
function promptForCall() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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

    const defaultPatientDisplay = config.DEFAULT_PATIENT_NUMBER ? ` [${config.DEFAULT_PATIENT_NUMBER}]` : '';
    rl.question(`Enter Patient phone number (E.164)${defaultPatientDisplay}: `, async (patientInput) => {
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

      rl.close();

      // Build the inline NCCO for the HCP leg
      const ncco = [
        {
          action: 'talk',
          language: 'fr-FR',
          text: 'Veuillez patienter pendant que nous mettons le patient en ligne.',
        },
        {
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
        },
      ];

      console.log(`\n[CALL] Initiating proxy call...`);
      console.log(`[CALL] HCP: ${hcpNumber} (from ${config.LVN_A})`);
      console.log(`[CALL] Patient: ${patientNumber} (from ${config.LVN_B})`);

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
}

module.exports = { app, server, isValidE164, normalizeE164 };
