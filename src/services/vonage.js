const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

/**
 * Generate a short-lived JWT for Vonage API authentication.
 * Decodes the private key from the base64-encoded env var and signs
 * with application_id, iat, jti, and a 15-minute expiry.
 */
function generateJwt() {
  const privateKey = Buffer.from(config.VONAGE_PRIVATE_KEY64, 'base64').toString('utf8');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    application_id: config.VONAGE_APPLICATION_ID,
    iat: now,
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '15m',
  });
}

/**
 * Create an outbound call via the Vonage Voice API.
 *
 * @param {Array} ncco - The inline NCCO actions array.
 * @param {string} to - Destination phone number (E.164).
 * @param {string} from - Caller ID / virtual number (E.164).
 * @param {string} eventUrl - Webhook URL for call status events.
 * @returns {Promise<object>} Parsed JSON response from Vonage.
 */
function createCall(ncco, to, from, eventUrl) {
  const token = generateJwt();

  const body = JSON.stringify({
    to: [{ type: 'phone', number: to }],
    from: { type: 'phone', number: from },
    ncco,
    event_url: [eventUrl],
  });

  return new Promise((resolve, reject) => {
    const https = require('https');

    const options = {
      hostname: 'api.nexmo.com',
      path: '/v1/calls',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Vonage API error (${res.statusCode}): ${data}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Vonage response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Start recording on a conversation via the Vonage Conversations API.
 *
 * @param {string} conversationUuid - The HCP conversation UUID to record.
 * @param {string} eventUrl - Webhook URL for recording completion events.
 * @returns {Promise<object>} Parsed JSON response from the API.
 * @throws {Error} If the API responds with a non-2xx status (includes status code and body).
 */
function startRecording(conversationUuid, eventUrl) {
  const token = generateJwt();

  const body = JSON.stringify({
    action: 'start',
    split: 'conversation',
    channels: 2,
    event_url: [eventUrl],
    event_method: 'POST',
    format: 'mp3',
  });

  return new Promise((resolve, reject) => {
    const https = require('https');

    const options = {
      hostname: 'api.nexmo.com',
      path: `/v1/conversations/${conversationUuid}/record`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Some 2xx responses (e.g., 204) may have empty body
          if (!data || data.trim() === '') {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            // 2xx but non-JSON body — still a success
            resolve({ rawResponse: data });
          }
        } else {
          reject(new Error(`Vonage API error (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Transfer an existing call to a new inline NCCO.
 *
 * Uses PUT /v1/calls/{callUuid} with action: "transfer" to replace the
 * call's current NCCO with a new one. In this application, this is used
 * to move the HCP leg into the recorded named conversation after the
 * patient grants consent.
 *
 * @param {string} callUuid - The UUID of the call leg to transfer.
 * @param {Array} ncco - The new NCCO actions array to execute on the call.
 * @returns {Promise<object>} Parsed response (often empty for 204).
 * @throws {Error} If the API responds with a non-2xx status.
 *
 * @example
 * // Transfer HCP into the recorded named conversation
 * await transferCall(hcpCallUuid, [
 *   { action: 'conversation', name: 'rec-1723012345678-a1b2c3d4', startOnEnter: true }
 * ]);
 */
function transferCall(callUuid, ncco) {
  const token = generateJwt();

  const body = JSON.stringify({
    action: 'transfer',
    destination: {
      type: 'ncco',
      ncco,
    },
  });

  return new Promise((resolve, reject) => {
    const https = require('https');

    const options = {
      hostname: 'api.nexmo.com',
      path: `/v1/calls/${callUuid}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Transfer typically returns 204 with empty body
          if (!data || data.trim() === '') {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            resolve({ rawResponse: data });
          }
        } else {
          reject(new Error(`Vonage API error (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { generateJwt, createCall, startRecording, transferCall };
