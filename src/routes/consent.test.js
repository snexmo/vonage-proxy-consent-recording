'use strict';

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
  getHcpCallUuid: jest.fn().mockReturnValue('hcp-call-uuid-123'),
  getCallOptions: jest.fn().mockReturnValue({
    voiceTier: 'standard',
    transcriptionProvider: 'none',
    amdEnabled: true,
  }),
}));

const consentRouter = require('./consent');
const { transferCall } = require('../services/vonage');
const { getHcpCallUuid, getCallOptions } = require('../services/callState');

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
    getHcpCallUuid.mockReturnValue('hcp-call-uuid-123');
    getCallOptions.mockReturnValue({
      voiceTier: 'standard',
      transcriptionProvider: 'none',
      amdEnabled: true,
    });
    transferCall.mockResolvedValue({});
  });

  describe('Consent granted (digit "1")', () => {
    test('returns NCCO with talk + conversation actions', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].action).toBe('talk');
      expect(res.body[1].action).toBe('conversation');
    });

    test('conversation action has record: true and correct name', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      const conversationAction = res.body[1];
      expect(conversationAction.name).toBe('hcp-call-uuid-123');
      expect(conversationAction.record).toBe(true);
      expect(conversationAction.startOnEnter).toBe(true);
      expect(conversationAction.endOnExit).toBe(true);
    });

    test('conversation action has NO transcription when provider is "none"', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(res.body[1].transcription).toBeUndefined();
    });

    test('conversation action has Vonage transcription when provider is "vonage"', async () => {
      getCallOptions.mockReturnValue({
        voiceTier: 'standard',
        transcriptionProvider: 'vonage',
        amdEnabled: true,
      });

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      const tx = res.body[1].transcription;
      expect(tx).toBeDefined();
      expect(tx.language).toBe('fr-FR');
      expect(tx.eventUrl).toEqual(['https://example.ngrok.io/transcriptions']);
      expect(tx.sentimentAnalysis).toBe(true);
      // Vonage built-in should NOT have provider/providerOptions
      expect(tx.provider).toBeUndefined();
    });

    test('conversation action has Deepgram transcription when provider is "deepgram"', async () => {
      getCallOptions.mockReturnValue({
        voiceTier: 'standard',
        transcriptionProvider: 'deepgram',
        amdEnabled: true,
      });

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      const tx = res.body[1].transcription;
      expect(tx.provider).toBe('deepgram');
      expect(tx.providerOptions.model).toBe('nova-2-phonecall');
      expect(tx.providerOptions.language).toBe('fr-FR');
      expect(tx.eventUrl).toEqual(['https://example.ngrok.io/transcriptions']);
    });

    test('conversation action has AWS transcription when provider is "aws"', async () => {
      getCallOptions.mockReturnValue({
        voiceTier: 'standard',
        transcriptionProvider: 'aws',
        amdEnabled: true,
      });

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      const tx = res.body[1].transcription;
      expect(tx.provider).toBe('aws');
      expect(tx.providerOptions.LanguageCode).toBe('fr-FR');
      expect(tx.providerOptions.Settings.ChannelIdentification).toBe(true);
    });

    test('calls transferCall with HCP call UUID and matching conversation name', async () => {
      await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      // Wait for fire-and-forget
      await new Promise(resolve => setImmediate(resolve));

      expect(transferCall).toHaveBeenCalledWith('hcp-call-uuid-123', [
        { action: 'conversation', name: 'hcp-call-uuid-123', startOnEnter: true, endOnExit: true },
      ]);
    });

    test('skips transfer when no HCP call UUID available', async () => {
      getHcpCallUuid.mockReturnValue(null);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(res.status).toBe(200);
      expect(transferCall).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[CONSENT] No HCP call UUID available — cannot transfer HCP to recorded conversation'
      );
      warnSpy.mockRestore();
    });

    test('logs error when transferCall fails without blocking response', async () => {
      transferCall.mockRejectedValue(new Error('Vonage API error (500): Internal Server Error'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(res.status).toBe(200);

      await new Promise(resolve => setImmediate(resolve));
      expect(errorSpy).toHaveBeenCalledWith(
        '[TRANSFER ERROR] Vonage API error (500): Internal Server Error'
      );
      errorSpy.mockRestore();
    });

    test('uses Premier voice tier when configured', async () => {
      getCallOptions.mockReturnValue({
        voiceTier: 'premier',
        transcriptionProvider: 'none',
        amdEnabled: true,
      });

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      const talkAction = res.body[0];
      expect(talkAction.provider).toBe('google');
      expect(talkAction.providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
      expect(talkAction.language).toBeUndefined();
    });
  });

  describe('Consent refused', () => {
    test('DTMF "2" returns talk-only NCCO', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '2', timed_out: false }, conversation_uuid: 'conv-456' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
      expect(res.body[0].text).toContain('ne pas enregistrer');
    });

    test('timeout returns talk-only NCCO', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '', timed_out: true }, conversation_uuid: 'conv-789' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
    });

    test('any other digit returns talk-only NCCO', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '5', timed_out: false }, conversation_uuid: 'conv-000' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
    });

    test('does not call transferCall on refusal', async () => {
      await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '2', timed_out: false }, conversation_uuid: 'conv-456' });

      await new Promise(resolve => setImmediate(resolve));
      expect(transferCall).not.toHaveBeenCalled();
    });

    test('refused NCCO does not contain conversation action', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '2', timed_out: false }, conversation_uuid: 'conv-456' });

      const conversationActions = res.body.filter(a => a.action === 'conversation');
      expect(conversationActions).toHaveLength(0);
    });

    test('uses selected voice tier for refusal message', async () => {
      getCallOptions.mockReturnValue({
        voiceTier: 'premium',
        transcriptionProvider: 'none',
        amdEnabled: false,
      });

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '2', timed_out: false }, conversation_uuid: 'conv-456' });

      expect(res.body[0].premium).toBe(true);
      expect(res.body[0].language).toBe('fr-FR');
    });
  });
});
