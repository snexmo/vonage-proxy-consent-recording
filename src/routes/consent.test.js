'use strict';

const express = require('express');
const request = require('supertest');

// Mock config
jest.mock('../config', () => ({
  BASE_URL: 'https://example.ngrok.io',
  TRANSCRIPTION_LANGUAGE: 'fr-FR',
}));

// Mock vonage service — startRecording (NOT transferCall)
jest.mock('../services/vonage', () => ({
  startRecording: jest.fn().mockResolvedValue({}),
}));

// Mock callState service
jest.mock('../services/callState', () => ({
  getHcpCallUuid: jest.fn().mockReturnValue('hcp-call-uuid-123'),
  getHcpConversationUuid: jest.fn().mockReturnValue('CON-abc123'),
  getCallOptions: jest.fn().mockReturnValue({
    voiceTier: 'standard',
    transcriptionProvider: 'none',
    amdEnabled: true,
  }),
}));

const consentRouter = require('./consent');
const { startRecording } = require('../services/vonage');
const { getHcpCallUuid, getHcpConversationUuid, getCallOptions } = require('../services/callState');

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
    getHcpConversationUuid.mockReturnValue('CON-abc123');
    getCallOptions.mockReturnValue({
      voiceTier: 'standard',
      transcriptionProvider: 'none',
      amdEnabled: true,
    });
    startRecording.mockResolvedValue({});
  });

  describe('Consent granted (digit "1")', () => {
    test('returns NCCO with a single talk action (no conversation action)', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
    });

    test('calls startRecording with HCP conversation UUID and event URL', async () => {
      await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(startRecording).toHaveBeenCalledWith(
        'CON-abc123',
        'https://example.ngrok.io/recordings',
        null // transcriptionProvider is "none" → buildTranscriptionConfigRest returns null
      );
    });

    test('still returns talk NCCO when startRecording fails', async () => {
      startRecording.mockRejectedValue(new Error('Vonage API error (500): Internal Server Error'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '1', timed_out: false }, conversation_uuid: 'conv-123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
      expect(errorSpy).toHaveBeenCalledWith(
        '[CONSENT] Failed to start recording: Vonage API error (500): Internal Server Error'
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
    test('DTMF "2" returns talk-only NCCO, no startRecording called', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '2', timed_out: false }, conversation_uuid: 'conv-456' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
      expect(res.body[0].text).toContain('ne pas enregistrer');
      expect(startRecording).not.toHaveBeenCalled();
    });

    test('timeout returns talk-only NCCO, no API calls', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '', timed_out: true }, conversation_uuid: 'conv-789' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
      expect(startRecording).not.toHaveBeenCalled();
    });

    test('unexpected digit returns talk-only NCCO, no API calls', async () => {
      const res = await request(app)
        .post('/consent')
        .send({ dtmf: { digits: '5', timed_out: false }, conversation_uuid: 'conv-000' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].action).toBe('talk');
      expect(startRecording).not.toHaveBeenCalled();
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
