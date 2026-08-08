'use strict';

const fc = require('fast-check');
const express = require('express');
const request = require('supertest');

// Mock config
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io',
  TRANSCRIPTION_LANGUAGE: 'fr-FR',
}));

// Mock vonage service
jest.mock('../services/vonage', () => ({
  transferCall: jest.fn().mockResolvedValue({}),
}));

// Mock callState service
jest.mock('../services/callState', () => ({
  getHcpCallUuid: jest.fn().mockReturnValue('hcp-call-uuid-fixed'),
  getCallOptions: jest.fn().mockReturnValue({
    voiceTier: 'standard',
    transcriptionProvider: 'deepgram',
    amdEnabled: true,
  }),
}));

const consentRouter = require('./consent');
const { transferCall } = require('../services/vonage');
const { getHcpCallUuid } = require('../services/callState');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/consent', consentRouter);
  return app;
}

/**
 * Property: The conversation name in the patient NCCO matches the one
 * used in the transferCall for the HCP leg.
 *
 * The conversation name is now the HCP call UUID — both the patient
 * conversation action and the HCP transfer NCCO must use the same value.
 */
describe('Property: Conversation name consistency between patient NCCO and HCP transfer', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    transferCall.mockResolvedValue({});
  });

  test('patient conversation name matches HCP transfer conversation name (both use hcpCallUuid)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (uuid) => {
          jest.clearAllMocks();
          getHcpCallUuid.mockReturnValue(uuid);
          transferCall.mockResolvedValue({});

          const res = await request(app)
            .post('/consent')
            .send({
              dtmf: { digits: '1', timed_out: false },
              conversation_uuid: `conv-test`,
            });

          // Wait for fire-and-forget
          await new Promise(resolve => setImmediate(resolve));

          // Patient NCCO conversation name should be the HCP call UUID
          const patientConvName = res.body[1].name;
          expect(patientConvName).toBe(uuid);

          // Transfer NCCO should use the same name
          expect(transferCall).toHaveBeenCalledTimes(1);
          const [callUuid, transferNcco] = transferCall.mock.calls[0];
          expect(callUuid).toBe(uuid);
          expect(transferNcco[0].name).toBe(uuid);
        }
      ),
      { numRuns: 20 }
    );
  });
});
