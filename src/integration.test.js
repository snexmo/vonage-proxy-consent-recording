'use strict';

/**
 * Integration Test — Simplified Proxy Recording Flow
 *
 * Validates the complete path for the simplified architecture:
 *
 *   1. HCP NCCO is built with [record, talk, connect] structure
 *   2. Patient NCCO always returns []
 *   3. AMD screener events are handled correctly
 *   4. Transcription webhook is handled correctly
 */

const express = require('express');
const request = require('supertest');

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('./config', () => ({
  BASE_URL: 'https://test.ngrok.io',
  TRANSCRIPTION_LANGUAGE: 'fr-FR',
  LVN_A: '+440000000001',
  LVN_B: '+440000000002',
  PORT: 0,
}));

jest.mock('./services/vonage', () => ({
  createCall: jest.fn().mockResolvedValue({ uuid: 'call-uuid-hcp', conversation_uuid: 'CON-hcp-123' }),
  generateJwt: jest.fn(() => 'mock-jwt'),
}));

const {
  storeHcpConversationUuid,
  storeCallOptions,
  clear,
} = require('./services/callState');

// Route modules
const nccoRouter = require('./routes/ncco');
const amdRouter = require('./routes/amd');
const { router: transcriptionsRouter } = require('./routes/transcriptions');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', nccoRouter);
  app.use('/events/amd', amdRouter);
  app.use('/transcriptions', transcriptionsRouter);
  return app;
}

describe('Integration: Simplified proxy recording flow', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    clear();
    jest.clearAllMocks();
  });

  /**
   * Patient NCCO always returns empty array (no consent workflow)
   */
  test('Patient NCCO GET returns empty array', async () => {
    const res = await request(app).get('/ncco/patient?conversation_uuid=CON-test-123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('Patient NCCO POST returns empty array', async () => {
    const res = await request(app)
      .post('/ncco/patient')
      .send({ conversation_uuid: 'CON-test-456' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * Test AMD screener event handling within the flow
   */
  test('AMD screener event returns French pass-through message', async () => {
    const amdRes = await request(app)
      .post('/events/amd')
      .send({ status: 'machine', sub_state: 'screener', call_uuid: 'call-uuid-pat' });

    expect(amdRes.status).toBe(200);
    expect(amdRes.body).toHaveLength(1);
    expect(amdRes.body[0].action).toBe('talk');
    expect(amdRes.body[0].text).toContain('professionnel de santé');
    // Screener message uses Standard voice (not Premier)
    expect(amdRes.body[0].language).toBe('fr-FR');
    expect(amdRes.body[0].provider).toBeUndefined();
  });

  /**
   * Test transcription webhook endpoint
   */
  test('Transcription webhook is handled correctly', async () => {
    const txRes = await request(app)
      .post('/transcriptions')
      .send({
        conversation_uuid: 'CON-hcp-123',
        recording_uuid: 'rec-uuid-xyz',
        status: 'transcribed',
        transcription_url: 'https://api.nexmo.com/v1/files/tx-123',
        provider: 'deepgram',
        type: 'record',
      });

    expect(txRes.status).toBe(200);
  });

  /**
   * Test buildHcpNcco produces correct structure
   */
  test('buildHcpNcco returns [record, talk, connect] with transcription', () => {
    const { buildHcpNcco } = require('./index');

    storeCallOptions({
      voiceTier: 'premium',
      transcriptionProvider: 'vonage',
      amdEnabled: false,
    });

    const ncco = buildHcpNcco('+33612345678', 'premium', 'vonage', false);

    expect(ncco).toHaveLength(3);
    expect(ncco[0].action).toBe('record');
    expect(ncco[0].split).toBe('conversation');
    expect(ncco[0].channels).toBe(2);
    expect(ncco[0].format).toBe('mp3');
    expect(ncco[0].transcription).toBeDefined();
    expect(ncco[1].action).toBe('talk');
    expect(ncco[2].action).toBe('connect');
    expect(ncco[2].from).toBe('+440000000002');
  });

  test('buildHcpNcco with no transcription omits transcription field', () => {
    const { buildHcpNcco } = require('./index');

    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);

    expect(ncco).toHaveLength(3);
    expect(ncco[0].action).toBe('record');
    expect(ncco[0].transcription).toBeUndefined();
  });

  test('buildHcpNcco with AMD enabled adds advancedMachineDetection to connect', () => {
    const { buildHcpNcco } = require('./index');

    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', true);

    expect(ncco[2].advancedMachineDetection).toBeDefined();
    expect(ncco[2].advancedMachineDetection.callScreener).toBe(true);
    expect(ncco[2].eventUrl).toEqual(['https://test.ngrok.io/events/amd']);
  });
});
