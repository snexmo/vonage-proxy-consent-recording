const express = require('express');
const { BASE_URL } = require('../config');
const { startRecording } = require('../services/vonage');
const { getHcpConversationUuid } = require('../services/callState');

const router = express.Router();

// POST /consent — Handle patient DTMF input and return conditional NCCO
router.post('/', (req, res) => {
  const { dtmf, conversation_uuid } = req.body;
  const digits = dtmf && dtmf.digits;
  const timedOut = dtmf && dtmf.timed_out;

  if (digits === '1') {
    console.log(`[CONSENT GRANTED] conversation_uuid=${conversation_uuid} — Patient pressed 1, recording enabled.`);

    const ncco = [
      {
        action: 'talk',
        language: 'fr-FR',
        text: 'Merci. Vous allez être mis en relation avec votre médecin.'
      }
    ];

    res.json(ncco);

    // Fire-and-forget: start recording on the HCP conversation
    const hcpConversationUuid = getHcpConversationUuid();
    if (!hcpConversationUuid) {
      console.warn('[CONSENT] No HCP conversation UUID available — skipping recording');
    } else {
      startRecording(hcpConversationUuid, `${BASE_URL}/recordings`)
        .then(() => console.log(`[RECORDING] Started on conversation ${hcpConversationUuid}`))
        .catch((err) => console.error(`[RECORDING API ERROR] ${err.message}`));
    }

    return;
  }

  // Consent refused: digit "2", timeout, or any other value
  const reason = timedOut
    ? 'timeout'
    : digits === '2'
      ? 'pressed 2'
      : `unexpected digit "${digits}"`;

  console.log(`[CONSENT REFUSED] conversation_uuid=${conversation_uuid} — Reason: ${reason}. No recording.`);

  const ncco = [
    {
      action: 'talk',
      language: 'fr-FR',
      text: 'Nous avons tenu compte de votre choix de ne pas enregistrer. Vous allez être mis en relation avec votre médecin.'
    }
  ];

  return res.json(ncco);
});

module.exports = router;
