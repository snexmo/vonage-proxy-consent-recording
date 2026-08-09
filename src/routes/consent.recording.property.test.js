'use strict';

const fc = require('fast-check');
const express = require('express');
const request = require('supertest');

// Mock config
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io',
  TRANSCRIPTION_LANGUAGE: 'fr-FR',
}));

// Mock vonage service — startRecording
jest.mock('../services/vonage', () => ({
  startRecording: jest.fn().mockResolvedValue({}),
}));

// Mock callState service
jest.mock('../services/callState', () => ({
  getHcpCallUuid: jest.fn().mockReturnValue('hcp-call-uuid-fixed'),
  getHcpConversationUuid: jest.fn().mockReturnValue('CON-fixed-uuid'),
  getCallOptions: jest.fn().mockReturnValue({
    voiceTier: 'standard',
    transcriptionProvider: 'none',
    amdEnabled: true,
  }),
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
 * Property: For digit "1", startRecording is always called with the HCP conversation UUID.
 *
 * The consent handler retrieves the HCP conversation UUID from callState and passes it
 * to startRecording. This property verifies the UUID is always forwarded correctly.
 */
describe('Property: startRecording is always called with the HCP conversation UUID', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    startRecording.mockResolvedValue({});
  });

  test('digit "1" always calls startRecording with the HCP conversation UUID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (uuid) => {
          jest.clearAllMocks();
          getHcpConversationUuid.mockReturnValue(uuid);
          startRecording.mockResolvedValue({});

          await request(app)
            .post('/consent')
            .send({
              dtmf: { digits: '1', timed_out: false },
              conversation_uuid: 'conv-test',
            });

          expect(startRecording).toHaveBeenCalledTimes(1);
          expect(startRecording.mock.calls[0][0]).toBe(uuid);
        }
      ),
      { numRuns: 20 }
    );
  });
});
