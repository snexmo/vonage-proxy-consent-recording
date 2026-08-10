'use strict';

const express = require('express');

const router = express.Router();

// GET /ncco/patient — returns empty NCCO for immediate bridge (no consent workflow)
router.get('/ncco/patient', (req, res) => {
  const conversationUuid = req.query.conversation_uuid || 'unknown';
  console.log(`[NCCO] GET /ncco/patient — conversation_uuid: ${conversationUuid}`);

  res.json([]);
});

// POST /ncco/patient — returns empty NCCO (Vonage may POST depending on config)
router.post('/ncco/patient', (req, res) => {
  const conversationUuid = (req.body && req.body.conversation_uuid) || 'unknown';
  console.log(`[NCCO] POST /ncco/patient — conversation_uuid: ${conversationUuid}`);

  res.json([]);
});

module.exports = router;
