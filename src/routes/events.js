const express = require('express');
const router = express.Router();

// POST /events — general call status events
router.post('/', (req, res) => {
  const event = req.body;

  if (event.status === 'unanswered' || event.status === 'failed') {
    console.warn('[EVENT WARNING]', event.status, event);
  } else {
    console.log('[EVENT]', event.status || event.type || 'unknown', event);
  }

  res.status(200).end();
});

// POST /events/connect — connect-leg events (patient leg)
router.post('/connect', (req, res) => {
  const event = req.body;

  if (event.status === 'unanswered') {
    console.warn('[EVENT/CONNECT WARNING] Patient did not answer:', event);
  } else if (event.status === 'failed') {
    console.warn('[EVENT/CONNECT WARNING]', event.status, event);
  } else {
    console.log('[EVENT/CONNECT]', event.status || event.type || 'unknown', event);
  }

  res.status(200).end();
});

module.exports = router;
