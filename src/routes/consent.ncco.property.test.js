const fc = require('fast-check');
const express = require('express');
const request = require('supertest');

// Mock config to provide a known BASE_URL
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io'
}));

// Mock vonage service — startRecording resolves immediately
jest.mock('../services/vonage', () => ({
  startRecording: jest.fn().mockResolvedValue({ id: 'rec-1', status: 'started' })
}));

// Mock callState service — returns a fixed HCP conversation UUID
jest.mock('../services/callState', () => ({
  getHcpConversationUuid: jest.fn().mockReturnValue('CON-hcp-fixed-uuid')
}));

const consentRouter = require('./consent');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/consent', consentRouter);
  return app;
}

/**
 * Property 1: NCCO never contains a record action
 *
 * For any DTMF input (including "1", "2", timeout, or any other digit string),
 * the NCCO returned by the consent handler SHALL NOT contain an action with
 * action: "record".
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
describe('Property: NCCO never contains a record action', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  test('no NCCO action has action "record" for any DTMF input', async () => {
    const digitsArb = fc.oneof(
      fc.constant('1'),
      fc.constant('2'),
      fc.constant(''),
      fc.stringOf(
        fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
        { minLength: 1, maxLength: 4 }
      )
    );

    const timedOutArb = fc.boolean();

    await fc.assert(
      fc.asyncProperty(digitsArb, timedOutArb, async (digits, timedOut) => {
        const res = await request(app)
          .post('/consent')
          .send({
            dtmf: { digits, timed_out: timedOut },
            conversation_uuid: 'test-conv'
          });

        // Response must be 200
        expect(res.status).toBe(200);

        // Response body must be an array of NCCO actions
        expect(Array.isArray(res.body)).toBe(true);

        // No action in the response should have action: "record"
        const recordActions = res.body.filter(a => a.action === 'record');
        expect(recordActions).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
