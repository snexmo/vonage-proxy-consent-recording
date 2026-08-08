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
  test('returns array with talk + connect actions', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', false);
    expect(ncco).toHaveLength(2);
    expect(ncco[0].action).toBe('talk');
    expect(ncco[1].action).toBe('connect');
  });

  test('talk action uses selected voice tier (standard)', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', false);
    expect(ncco[0].language).toBe('fr-FR');
    expect(ncco[0].style).toBe(0);
    expect(ncco[0].provider).toBeUndefined();
  });

  test('talk action uses Premier voice tier', () => {
    const ncco = buildHcpNcco('+33612345678', 'premier', false);
    expect(ncco[0].provider).toBe('google');
    expect(ncco[0].providerOptions.name).toBe('fr-FR-Chirp3-HD-Aoede');
    expect(ncco[0].language).toBeUndefined();
  });

  test('connect action dials patient number with onAnswer', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', false);
    const connect = ncco[1];
    expect(connect.endpoint[0].type).toBe('phone');
    expect(connect.endpoint[0].number).toBe('+33612345678');
    expect(connect.endpoint[0].onAnswer.url).toBe('https://example.ngrok.io/ncco/patient');
    expect(connect.endpoint[0].onAnswer.ringbackTone).toBe('https://example.ngrok.io/audio/hold-music.mp3');
  });

  test('connect action uses LVN_B as from', () => {
    const ncco = buildHcpNcco('+33612345678', 'standard', false);
    expect(ncco[1].from).toBe('+440000000002');
  });

  describe('AMD disabled', () => {
    test('connect does NOT include advancedMachineDetection', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', false);
      expect(ncco[1].advancedMachineDetection).toBeUndefined();
    });

    test('connect eventUrl points to /events/connect', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', false);
      expect(ncco[1].eventUrl).toEqual(['https://example.ngrok.io/events/connect']);
    });
  });

  describe('AMD enabled', () => {
    test('connect includes advancedMachineDetection with callScreener', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', true);
      const amd = ncco[1].advancedMachineDetection;
      expect(amd).toBeDefined();
      expect(amd.behavior).toBe('continue');
      expect(amd.mode).toBe('default');
      expect(amd.beepTimeout).toBe(45);
      expect(amd.callScreener).toBe(true);
    });

    test('connect eventUrl points to /events/amd', () => {
      const ncco = buildHcpNcco('+33612345678', 'standard', true);
      expect(ncco[1].eventUrl).toEqual(['https://example.ngrok.io/events/amd']);
    });
  });
});
