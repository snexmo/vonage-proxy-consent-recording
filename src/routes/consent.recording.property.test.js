'use strict';

const fc = require('fast-check');
const express = require('express');
const request = require('supertest');

// Mock config to provide a known BASE_URL
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io'
}));

// Mock vonage service
jest.mock('../services/vonage', () => ({
  startRecording: jest.fn().mockResolvedValue({ id: 'rec-1', status: 'started' })
}));

// Mock callState service
jest.mock('../services/callState', () => ({
  getHcpConversationUuid: jest.fn().mockReturnValue(null)
}));

const consentRouter = require('./consent');
const { startRecording } = require('../services/vonage');
const { getHcpConversationUuid } = require('../services/callState');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/consent', consentRouter);
  return app;
}

/**
 * Property 6: Recording targets HCP conversation UUID
 *
 * For any consent-granted event where both HCP and patient conversation UUIDs exist,
 * the conversation UUID passed to startRecording SHALL be the stored HCP conversation UUID,
 * not the conversation_uuid from the consent webhook payload.
 *
 * Validates: Requirements 3.3
 */
describe('Property 6: Recording targets HCP conversation UUID', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    startRecording.mockResolvedValue({ id: 'rec-1', status: 'started' });
  });

  test('startRecording is called with HCP UUID, not patient conversation UUID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
        fc.string({ minLength: 5, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
        async (hcpUuid, patientConversationUuid) => {
          // Ensure the two UUIDs are distinct
          fc.pre(hcpUuid !== patientConversationUuid);

          // Configure mock: getHcpConversationUuid returns the HCP UUID
          getHcpConversationUuid.mockReturnValue(hcpUuid);
          startRecording.mockClear();

          // POST to /consent with patient's conversation_uuid in the body
          const res = await request(app)
            .post('/consent')
            .send({
              dtmf: { digits: '1', timed_out: false },
              conversation_uuid: patientConversationUuid
            });

          expect(res.status).toBe(200);

          // Wait for fire-and-forget recording to trigger
          await new Promise(resolve => setImmediate(resolve));

          // startRecording must have been called with the HCP UUID
          expect(startRecording).toHaveBeenCalledTimes(1);
          const calledWithUuid = startRecording.mock.calls[0][0];

          // The recording must target the HCP UUID
          expect(calledWithUuid).toBe(hcpUuid);

          // The recording must NOT be targeting the patient's conversation UUID
          expect(calledWithUuid).not.toBe(patientConversationUuid);
        }
      ),
      { numRuns: 100 }
    );
  });
});
