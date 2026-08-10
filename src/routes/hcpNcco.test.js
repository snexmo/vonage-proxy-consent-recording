'use strict';

// Mock config
jest.mock('../config', () => ({
  PORT: 0,
  BASE_URL: 'https://example.ngrok.io',
  LVN_A: '+440000000001',
  LVN_B: '+440000000002',
  DEFAULT_HCP_NUMBER: '',
  DEFAULT_PATIENT_NUMBER: '',
  TRANSCRIPTION_LANGUAGE: 'fr-FR',
}));

// Mock vonage service
jest.mock('../services/vonage', () => ({
  createCall: jest.fn(),
  generateJwt: jest.fn(() => 'mock-jwt'),
  transferCall: jest.fn().mockResolvedValue({}),
}));

// Mock callState
jest.mock('../services/callState', () => ({
  storeHcpConversationUuid: jest.fn(),
  storeCallOptions: jest.fn(),
  getHcpCallUuid: jest.fn(),
  getCallOptions: jest.fn().mockReturnValue({ voiceTier: 'standard' }),
  clear: jest.fn(),
}));

// Mock readline to prevent interactive prompts
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn(),
    close: jest.fn(),
  })),
}));

const { buildHcpNcco, server } = require('../index');

afterAll((done) => {
  if (server && server.close) {
    server.close(done);
  } else {
    done();
  }
});

describe('buildHcpNcco', () => {
  test('returns array with record + talk + connect actions', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
    expect(ncco).toHaveLength(3);
    expect(ncco[0].action).toBe('record');
    expect(ncco[1].action).toBe('talk');
    expect(ncco[2].action).toBe('connect');
  });

  test('record action has correct fields', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
    const record = ncco[0];
    expect(record.action).toBe('record');
    expect(record.split).toBe('conversation');
    expect(record.channels).toBe(2);
    expect(record.format).toBe('mp3');
    expect(record.eventUrl).toEqual(['https://example.ngrok.io/recordings']);
    expect(record.eventMethod).toBe('POST');
  });

  test('record action does NOT include transcription when provider is none', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
    expect(ncco[0].transcription).toBeUndefined();
  });

  test('record action includes transcription when provider is vonage', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'vonage', false);
    const record = ncco[0];
    expect(record.transcription).toBeDefined();
    expect(record.transcription.language).toBe('fr-FR');
    expect(record.transcription.eventUrl).toEqual(['https://example.ngrok.io/transcriptions']);
    expect(record.transcription.eventMethod).toBe('POST');
  });

  test('record action includes transcription when provider is deepgram', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'deepgram', false);
    const record = ncco[0];
    expect(record.transcription).toBeDefined();
    expect(record.transcription.provider).toBe('deepgram');
    expect(record.transcription.providerOptions.model).toBe('nova-3');
  });

  test('record action includes transcription when provider is deepgram-medical', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'deepgram-medical', false);
    const record = ncco[0];
    expect(record.transcription).toBeDefined();
    expect(record.transcription.provider).toBe('deepgram');
    expect(record.transcription.providerOptions.model).toBe('nova-3-medical');
  });

  test('record action includes transcription when provider is aws', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'aws', false);
    const record = ncco[0];
    expect(record.transcription).toBeDefined();
    expect(record.transcription.provider).toBe('aws');
    expect(record.transcription.providerOptions.LanguageCode).toBe('fr-FR');
  });

  test('talk action uses selected voice tier (standard)', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
    expect(ncco[1].language).toBe('fr-FR');
    expect(ncco[1].style).toBe(0);
    expect(ncco[1].provider).toBeUndefined();
  });

  test('talk action uses Premier voice tier', () => {
    const ncco = buildHcpNcco('+33612345678', 'premier', 'none', false);
    expect(ncco[1].provider).toBe('google');
    expect(ncco[1].providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
    expect(ncco[1].language).toBeUndefined();
  });

  test('connect action dials patient number with onAnswer', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
    const connect = ncco[2];
    expect(connect.endpoint[0].type).toBe('phone');
    expect(connect.endpoint[0].number).toBe('+33612345678');
    expect(connect.endpoint[0].onAnswer.url).toBe('https://example.ngrok.io/ncco/patient');
    expect(connect.endpoint[0].onAnswer.ringbackTone).toBe('https://example.ngrok.io/audio/hold-music.mp3');
  });

  test('connect action uses LVN_B as from', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
    expect(ncco[2].from).toBe('+440000000002');
  });

  describe('AMD disabled', () => {
    test('connect does NOT include advancedMachineDetection', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
      expect(ncco[2].advancedMachineDetection).toBeUndefined();
    });

    test('connect eventUrl points to /events/connect', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', 'none', false);
      expect(ncco[2].eventUrl).toEqual(['https://example.ngrok.io/events/connect']);
    });
  });

  describe('AMD enabled', () => {
    test('connect includes advancedMachineDetection with callScreener', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', 'none', true);
      const amd = ncco[2].advancedMachineDetection;
      expect(amd).toBeDefined();
      expect(amd.behavior).toBe('continue');
      expect(amd.mode).toBe('default');
      expect(amd.beepTimeout).toBe(45);
      expect(amd.callScreener).toBe(true);
    });

    test('connect eventUrl points to /events/amd', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', 'none', true);
      expect(ncco[2].eventUrl).toEqual(['https://example.ngrok.io/events/amd']);
    });
  });
});
