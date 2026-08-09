'use strict';

const fc = require('fast-check');
const express = require('express');
const request = require('supertest');

// Mock config
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io',
  TRANSCRIPTION_LANGUAGE: 'fr-FR',
}));

// Mock vonage service — startRecording (new architecture)
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

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/consent', consentRouter);
  return app;
}

/**
 * Property 1: Consent granted NCCO always contains ONLY talk actions
 * (no conversation, no record).
 *
 * For DTMF digit "1", the returned NCCO SHALL contain only talk actions.
 */
describe('Property: Consent granted always produces talk-only NCCO', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  test('digit "1" always returns ONLY talk actions (no conversation, no record)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // conversation_uuid
        async (convUuid) => {
          const res = await request(app)
            .post('/consent')
            .send({
              dtmf: { digits: '1', timed_out: false },
              conversation_uuid: convUuid,
            });

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);

          // All actions must be talk — no conversation or record
          for (const action of res.body) {
            expect(action.action).toBe('talk');
          }

          const conversationActions = res.body.filter(a => a.action === 'conversation');
          const recordActions = res.body.filter(a => a.action === 'record');
          expect(conversationActions).toHaveLength(0);
          expect(recordActions).toHaveLength(0);
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 2: Consent refused NCCO never contains a conversation or record action
 *
 * For any DTMF input other than "1", the returned NCCO SHALL NOT contain
 * an action with action: "conversation" or action: "record".
 */
describe('Property: Consent refused never produces conversation or record action', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  test('non-"1" digits never return conversation or record actions', async () => {
    const nonConsentDigits = fc.oneof(
      fc.constant('2'),
      fc.constant('0'),
      fc.constant(''),
      fc.stringOf(
        fc.constantFrom('0', '2', '3', '4', '5', '6', '7', '8', '9'),
        { minLength: 1, maxLength: 4 }
      )
    );

    await fc.assert(
      fc.asyncProperty(
        nonConsentDigits,
        fc.boolean(),
        async (digits, timedOut) => {
          const res = await request(app)
            .post('/consent')
            .send({
              dtmf: { digits, timed_out: timedOut },
              conversation_uuid: 'test-conv',
            });

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);

          const conversationActions = res.body.filter(a => a.action === 'conversation');
          const recordActions = res.body.filter(a => a.action === 'record');
          expect(conversationActions).toHaveLength(0);
          expect(recordActions).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
