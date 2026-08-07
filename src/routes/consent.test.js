const express = require('express');
const request = require('supertest');
const consentRouter = require('./consent');

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
  getHcpConversationUuid: jest.fn().mockReturnValue('CON-hcp-uuid-123')
}));

const { startRecording } = require('../services/vonage');
const { getHcpConversationUuid } = require('../services/callState');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/consent', consentRouter);
  return app;
}

describe('POST /consent', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    getHcpConversationUuid.mockReturnValue('CON-hcp-uuid-123');
    startRecording.mockResolvedValue({ id: 'rec-1', status: 'started' });
  });

  test('DTMF "1" returns NCCO with only talk action (no record action)', async () => {
    const res = await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '1', timed_out: false },
        conversation_uuid: 'conv-123'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({
      action: 'talk',
      language: 'fr-FR',
      text: 'Merci. Vous allez être mis en relation avec votre médecin.'
    });
    // No record action in the NCCO
    expect(res.body.find(a => a.action === 'record')).toBeUndefined();
  });

  test('DTMF "1" calls startRecording with HCP conversation UUID', async () => {
    await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '1', timed_out: false },
        conversation_uuid: 'conv-123'
      });

    // Wait for fire-and-forget promise to resolve
    await new Promise(resolve => setImmediate(resolve));

    expect(startRecording).toHaveBeenCalledWith(
      'CON-hcp-uuid-123',
      'https://example.ngrok.io/recordings'
    );
  });

  test('DTMF "1" skips recording when no HCP conversation UUID available', async () => {
    getHcpConversationUuid.mockReturnValue(null);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const res = await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '1', timed_out: false },
        conversation_uuid: 'conv-123'
      });

    expect(res.status).toBe(200);
    expect(startRecording).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[CONSENT] No HCP conversation UUID available — skipping recording'
    );

    warnSpy.mockRestore();
  });

  test('DTMF "1" logs error when startRecording fails without blocking response', async () => {
    startRecording.mockRejectedValue(new Error('Vonage API error (500): Internal Server Error'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const res = await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '1', timed_out: false },
        conversation_uuid: 'conv-123'
      });

    // Response is still successful
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    // Wait for fire-and-forget promise to reject
    await new Promise(resolve => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      '[RECORDING API ERROR] Vonage API error (500): Internal Server Error'
    );

    errorSpy.mockRestore();
  });

  test('DTMF "2" returns NCCO without record action', async () => {
    const res = await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '2', timed_out: false },
        conversation_uuid: 'conv-456'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({
      action: 'talk',
      language: 'fr-FR',
      text: 'Nous avons tenu compte de votre choix de ne pas enregistrer. Vous allez être mis en relation avec votre médecin.'
    });
  });

  test('Timeout returns NCCO without record action', async () => {
    const res = await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '', timed_out: true },
        conversation_uuid: 'conv-789'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({
      action: 'talk',
      language: 'fr-FR',
      text: 'Nous avons tenu compte de votre choix de ne pas enregistrer. Vous allez être mis en relation avec votre médecin.'
    });
  });

  test('Any other digit returns NCCO without record action', async () => {
    const res = await request(app)
      .post('/consent')
      .send({
        dtmf: { digits: '5', timed_out: false },
        conversation_uuid: 'conv-000'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({
      action: 'talk',
      language: 'fr-FR',
      text: 'Nous avons tenu compte de votre choix de ne pas enregistrer. Vous allez être mis en relation avec votre médecin.'
    });
  });
});


const fc = require('fast-check');

/**
 * Property 1: Consent NCCO talk actions always include French language
 * For any DTMF input submitted to the /consent endpoint, every object with
 * action: "talk" in the returned NCCO array SHALL contain language: "fr-FR".
 *
 * Validates: Requirements 1.2
 */
describe('Property: Consent NCCO talk actions always include French language', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    getHcpConversationUuid.mockReturnValue('CON-hcp-uuid-123');
    startRecording.mockResolvedValue({ id: 'rec-1', status: 'started' });
  });

  test('all talk actions include language fr-FR for any DTMF input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Valid single digits
          fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
          // Empty string (timeout scenario)
          fc.constant(''),
          // Multi-digit strings
          fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 2, maxLength: 4 })
        ),
        fc.boolean(),
        async (digits, timedOut) => {
          const res = await request(app)
            .post('/consent')
            .send({
              dtmf: { digits, timed_out: timedOut },
              conversation_uuid: 'conv-prop-test'
            });

          expect(res.status).toBe(200);
          const talkActions = res.body.filter(action => action.action === 'talk');
          expect(talkActions.length).toBeGreaterThan(0);
          for (const talk of talkActions) {
            expect(talk.language).toBe('fr-FR');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
