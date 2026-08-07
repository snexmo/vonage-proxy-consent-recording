const express = require('express');
const { BASE_URL } = require('../config');

const router = express.Router();

// GET /ncco/patient — serves consent NCCO when patient answers
router.get('/ncco/patient', (req, res) => {
  const conversationUuid = req.query.conversation_uuid || 'unknown';
  console.log(`[NCCO] GET /ncco/patient — conversation_uuid: ${conversationUuid}`);

  const ncco = [
    {
      action: 'talk',
      language: 'fr-FR',
      text: 'Bonjour. Votre professionnel de santé souhaite vous contacter. Cet appel peut être enregistré à des fins médicales. Appuyez sur 1 pour accepter l\'enregistrement, ou sur 2 pour refuser.',
      bargeIn: true
    },
    {
      action: 'input',
      type: ['dtmf'],
      dtmf: {
        maxDigits: 1,
        timeOut: 10
      },
      eventUrl: [`${BASE_URL}/consent`]
    }
  ];

  res.json(ncco);
});

// POST /ncco/patient — same consent NCCO (Vonage may POST depending on config)
router.post('/ncco/patient', (req, res) => {
  const conversationUuid = (req.body && req.body.conversation_uuid) || 'unknown';
  console.log(`[NCCO] POST /ncco/patient — conversation_uuid: ${conversationUuid}`);

  const ncco = [
    {
      action: 'talk',
      language: 'fr-FR',
      text: 'Bonjour. Votre médecin souhaite vous contacter. Cet appel peut être enregistré à des fins médicales. Appuyez sur 1 pour accepter l\'enregistrement, ou sur 2 pour refuser.',
      bargeIn: true
    },
    {
      action: 'input',
      type: ['dtmf'],
      dtmf: {
        maxDigits: 1,
        timeOut: 10
      },
      eventUrl: [`${BASE_URL}/consent`]
    }
  ];

  res.json(ncco);
});

module.exports = router;
