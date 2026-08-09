const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateJwt } = require('../services/vonage');

const router = express.Router();

// Ensure recordings/ directory exists
const recordingsDir = path.join(__dirname, '..', '..', 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// POST /recordings — receive recording metadata and download the file
router.post('/', (req, res) => {
  console.log('[RECORDING] >>> Webhook hit! Raw body:', JSON.stringify(req.body));

  const { recording_url, recording_uuid, conversation_uuid, start_time, end_time, size, status } = req.body;

  console.log('[RECORDING] Metadata received:');
  console.log(`  recording_uuid: ${recording_uuid}`);
  console.log(`  conversation_uuid: ${conversation_uuid}`);
  console.log(`  recording_url: ${recording_url}`);
  console.log(`  start_time: ${start_time}`);
  console.log(`  end_time: ${end_time}`);
  console.log(`  size: ${size}`);
  console.log(`  status: ${status}`);

  // Return 200 immediately — download proceeds asynchronously
  res.status(200).end();

  // Download the recording asynchronously
  downloadRecording(recording_url, conversation_uuid).catch((err) => {
    console.error(`[RECORDING] Download error: ${err.message}`);
  });
});

/**
 * Download a recording from Vonage using JWT authentication.
 * @param {string} recordingUrl - The URL to download the recording from
 * @param {string} conversationUuid - The conversation UUID for the filename
 */
async function downloadRecording(recordingUrl, conversationUuid) {
  const https = require('https');
  const token = generateJwt();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${conversationUuid}.mp3`;
  const filePath = path.join(recordingsDir, filename);

  return new Promise((resolve, reject) => {
    const url = new URL(recordingUrl);

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
        reject(new Error(`Recording download failed with status ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`[RECORDING] Saved to: ${filePath}`);
        resolve(filePath);
      });

      fileStream.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Clean up partial file
        reject(err);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { router, downloadRecording };
