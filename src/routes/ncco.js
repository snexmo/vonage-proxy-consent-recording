'use strict';

const express = require('express');
const { BASE_URL } = require('../config');
const { getCallOptions } = require('../services/callState');
const { buildTalkAction } = require('../services/tts');

const router = express.Router();

// Consent prompt text (French, healthcare context)
const CONSENT_PROMPT_TEXT =
  'Bonjour. Votre professionnel de santé souhaite vous contacter. ' +
  'Cet appel peut être enregistré à des fins médicales. ' +
  'Appuyez sur 1 pour accepter l\'enregistrement, ou sur 2 pour refuser.';

/**
 * Build the consent NCCO using the current call's voice tier.
 * This NCCO is served to the patient when they answer the call (onAnswer).
 */
function buildConsentNcco() {
  const callOptions = getCallOptions() || { voiceTier: 'standard' };

  // Build the consent prompt TTS using the selected voice tier
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ NOTE: If using Premier (Chirp3 HD), the talk action will use        │
  // │ `provider` + `providerOptions` instead of `language` + `style`.     │
  // │ Premier voices are a new feature — see src/services/tts.js          │
  // └─────────────────────────────────────────────────────────────────────┘
  const talkAction = buildTalkAction(CONSENT_PROMPT_TEXT, callOptions.voiceTier, {
    bargeIn: true,
  });

  return [
    talkAction,
    {
      action: 'input',
      type: ['dtmf'],
      dtmf: {
        maxDigits: 1,
        timeOut: 10,
      },
      eventUrl: [`${BASE_URL}/consent`],
    },
  ];
}

// GET /ncco/patient — serves consent NCCO when patient answers
router.get('/ncco/patient', (req, res) => {
  const conversationUuid = req.query.conversation_uuid || 'unknown';
  console.log(`[NCCO] GET /ncco/patient — conversation_uuid: ${conversationUuid}`);

  res.json(buildConsentNcco());
});

// POST /ncco/patient — same consent NCCO (Vonage may POST depending on config)
router.post('/ncco/patient', (req, res) => {
  const conversationUuid = (req.body && req.body.conversation_uuid) || 'unknown';
  console.log(`[NCCO] POST /ncco/patient — conversation_uuid: ${conversationUuid}`);

  res.json(buildConsentNcco());
});

module.exports = router;
