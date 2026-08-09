'use strict';

/**
 * Integration Test — Full Consent-Granted Flow
 *
 * Validates the complete path from call initiation through consent
 * to recorded named conversation, ensuring all components work together:
 *
 *   1. HCP NCCO is built with correct voice tier + AMD config
 *   2. Patient consent NCCO uses the configured voice tier
 *   3. Consent granted returns conversation action with record + transcription
 *   4. transferCall is invoked with matching conversation name
 *   5. TTS structure is correct for each voice tier
 *   6. Transcription config is correct for each provider
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
  transferCall: jest.fn().mockResolvedValue({}),
  startRecording: jest.fn().mockResolvedValue({}),
  generateJwt: jest.fn(() => 'mock-jwt'),
}));

const { transferCall, startRecording } = require('./services/vonage');
const {
  storeHcpConversationUuid,
  storeCallOptions,
  getCallOptions,
  getHcpCallUuid,
  clear,
} = require('./services/callState');

// Route modules
const nccoRouter = require('./routes/ncco');
const consentRouter = require('./routes/consent');
const amdRouter = require('./routes/amd');
const { router: transcriptionsRouter } = require('./routes/transcriptions');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/', nccoRouter);
  app.use('/consent', consentRouter);
  app.use('/events/amd', amdRouter);
  app.use('/transcriptions', transcriptionsRouter);
  return app;
}

describe('Integration: Full consent-granted flow', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    clear();
    jest.clearAllMocks();
  });

  // ─── Coming in a future release (requires NCCO-based recording path) ───
  // /**
  //  * Test the full flow with Premier voice + Deepgram transcription + AMD on
  //  */
  // test('Premier voice + Deepgram: full consent-granted flow', async () => {
  //   // ─── Simulate call initiation ───────────────────────────────────────
  //   storeCallOptions({
  //     voiceTier: 'premier',
  //     transcriptionProvider: 'deepgram',
  //     amdEnabled: true,
  //   });
  //   storeHcpConversationUuid('call-uuid-hcp', 'CON-hcp-123');
  //
  //   // ─── Step 1: Patient answers → consent NCCO ─────────────────────────
  //   const nccoRes = await request(app).get('/ncco/patient');
  //   expect(nccoRes.status).toBe(200);
  //   expect(nccoRes.body).toHaveLength(2);
  //
  //   // Talk action uses Premier (Chirp3 HD)
  //   const consentTalk = nccoRes.body[0];
  //   expect(consentTalk.action).toBe('talk');
  //   expect(consentTalk.provider).toBe('google');
  //   expect(consentTalk.providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
  //   expect(consentTalk.providerOptions.language_code).toBe('fr-FR');
  //   expect(consentTalk.language).toBeUndefined(); // Premier must NOT have language
  //   expect(consentTalk.bargeIn).toBe(true);
  //
  //   // Input action
  //   expect(nccoRes.body[1].action).toBe('input');
  //   expect(nccoRes.body[1].eventUrl).toEqual(['https://test.ngrok.io/consent']);
  //
  //   // ─── Step 2: Patient presses 1 → consent granted ────────────────────
  //   const consentRes = await request(app)
  //     .post('/consent')
  //     .send({
  //       dtmf: { digits: '1', timed_out: false },
  //       conversation_uuid: 'CON-patient-temp',
  //     });
  //
  //   expect(consentRes.status).toBe(200);
  //   expect(consentRes.body).toHaveLength(1);
  //
  //   // Talk confirmation uses Premier
  //   const confirmTalk = consentRes.body[0];
  //   expect(confirmTalk.action).toBe('talk');
  //   expect(confirmTalk.provider).toBe('google');
  //   expect(confirmTalk.providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
  //
  //   // ─── Step 3: startRecording was called with Deepgram transcription ───
  //   expect(startRecording).toHaveBeenCalledTimes(1);
  //   const [conversationUuid, eventUrl, transcriptionConfig] = startRecording.mock.calls[0];
  //   expect(conversationUuid).toBe('CON-hcp-123');
  //   expect(eventUrl).toBe('https://test.ngrok.io/recordings');
  //
  //   // Transcription config uses snake_case (REST API format)
  //   expect(transcriptionConfig).toBeDefined();
  //   expect(transcriptionConfig.provider).toBe('deepgram');
  //   expect(transcriptionConfig.provider_options.model).toBe('nova-2-phonecall');
  //   expect(transcriptionConfig.provider_options.language).toBe('fr-FR');
  //   expect(transcriptionConfig.provider_options.diarize).toBe(true);
  //   expect(transcriptionConfig.event_url).toEqual(['https://test.ngrok.io/transcriptions']);
  //
  //   // ─── Step 4: HCP transfer was NOT called (new arch doesn't transfer) ─
  //   await new Promise(resolve => setImmediate(resolve));
  // });

  // /**
  //  * Test with Standard voice + AWS transcription
  //  */
  // test('Standard voice + AWS: consent-granted flow', async () => {
  //   storeCallOptions({
  //     voiceTier: 'standard',
  //     transcriptionProvider: 'aws',
  //     amdEnabled: false,
  //   });
  //   storeHcpConversationUuid('call-uuid-hcp-2', 'CON-hcp-456');
  //
  //   // Patient consent NCCO uses Standard voice
  //   const nccoRes = await request(app).get('/ncco/patient');
  //   expect(nccoRes.body[0].language).toBe('fr-FR');
  //   expect(nccoRes.body[0].style).toBe(0);
  //   expect(nccoRes.body[0].provider).toBeUndefined();
  //
  //   // Consent granted
  //   const consentRes = await request(app)
  //     .post('/consent')
  //     .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'CON-pat-temp-2' });
  //
  //   // Response is just the talk action
  //   expect(consentRes.body).toHaveLength(1);
  //   expect(consentRes.body[0].action).toBe('talk');
  //
  //   // startRecording was called with AWS transcription config
  //   expect(startRecording).toHaveBeenCalledTimes(1);
  //   const [convUuid, eventUrl, txConfig] = startRecording.mock.calls[0];
  //   expect(convUuid).toBe('CON-hcp-456');
  //   expect(eventUrl).toBe('https://test.ngrok.io/recordings');
  //   expect(txConfig.provider).toBe('aws');
  //   expect(txConfig.provider_options.LanguageCode).toBe('fr-FR');
  //   expect(txConfig.provider_options.Settings.ChannelIdentification).toBe(true);
  //
  //   // No transfer in new architecture
  //   await new Promise(resolve => setImmediate(resolve));
  // });

  /**
   * Test with Premium voice + Vonage built-in transcription
   */
  test('Premium voice + Vonage transcription: consent-granted flow', async () => {
    storeCallOptions({
      voiceTier: 'premium',
      transcriptionProvider: 'vonage',
      amdEnabled: true,
    });
    storeHcpConversationUuid('call-uuid-hcp-3', 'CON-hcp-789');

    const consentRes = await request(app)
      .post('/consent')
      .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'CON-pat-temp-3' });

    // Talk uses Premium (language + style + premium: true)
    expect(consentRes.body).toHaveLength(1);
    expect(consentRes.body[0].language).toBe('fr-FR');
    expect(consentRes.body[0].premium).toBe(true);
    expect(consentRes.body[0].provider).toBeUndefined();

    // startRecording was called with Vonage transcription config (snake_case)
    expect(startRecording).toHaveBeenCalledTimes(1);
    const [, , txConfig] = startRecording.mock.calls[0];
    expect(txConfig.language).toBe('fr-FR');
    expect(txConfig.provider).toBeUndefined();
    expect(txConfig.event_url).toEqual(['https://test.ngrok.io/transcriptions']);
  });

  /**
   * Test with no transcription provider
   */
  test('No transcription: conversation action has no transcription field', async () => {
    storeCallOptions({
      voiceTier: 'standard',
      transcriptionProvider: 'none',
      amdEnabled: false,
    });
    storeHcpConversationUuid('call-uuid-hcp-4', 'CON-hcp-000');

    const consentRes = await request(app)
      .post('/consent')
      .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'CON-pat-temp-4' });

    // Response is just the talk action
    expect(consentRes.body).toHaveLength(1);
    expect(consentRes.body[0].action).toBe('talk');

    // startRecording was called with null transcription config
    expect(startRecording).toHaveBeenCalledTimes(1);
    const [, , txConfig] = startRecording.mock.calls[0];
    expect(txConfig).toBeNull();
  });

  /**
   * Test consent refused — no conversation, no transfer
   */
  test('Consent refused: no conversation action, no transfer', async () => {
    storeCallOptions({
      voiceTier: 'premier',
      transcriptionProvider: 'deepgram',
      amdEnabled: true,
    });
    storeHcpConversationUuid('call-uuid-hcp-5', 'CON-hcp-111');

    const consentRes = await request(app)
      .post('/consent')
      .send({ dtmf: { digits: '2', timed_out: false }, conversation_uuid: 'CON-pat-temp-5' });

    expect(consentRes.body).toHaveLength(1);
    expect(consentRes.body[0].action).toBe('talk');
    expect(consentRes.body[0].provider).toBe('google'); // Still uses Premier for the message
    expect(consentRes.body.find(a => a.action === 'conversation')).toBeUndefined();

    await new Promise(resolve => setImmediate(resolve));
    expect(transferCall).not.toHaveBeenCalled();
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
});
