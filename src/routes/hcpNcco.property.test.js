'use strict';

const fc = require('fast-check');

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
}));

// Mock callState
jest.mock('../services/callState', () => ({
  storeHcpConversationUuid: jest.fn(),
  storeCallOptions: jest.fn(),
  getCallOptions: jest.fn().mockReturnValue({ voiceTier: 'standard' }),
  getHcpCallUuid: jest.fn(),
  getHcpConversationUuid: jest.fn(),
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

/**
 * Feature: simple-proxy-recording, Property 3: NCCO action ordering
 *
 * **Validates: Requirements 2.2**
 *
 * For any valid call configuration (any voice tier, any transcription provider,
 * AMD on or off), the generated HCP inline NCCO SHALL contain exactly 3 actions
 * in the order: record, talk, connect.
 */
describe('Property 3: NCCO action ordering', () => {
  // Generators
  const voiceTierArb = fc.constantFrom('standard', 'premium', 'premier');
  const transcriptionProviderArb = fc.constantFrom('none', 'vonage', 'deepgram', 'deepgram-medical', 'aws');
  const amdEnabledArb = fc.boolean();
  const patientNumberArb = fc.tuple(
    fc.constantFrom('+1', '+33', '+44', '+49', '+61'),
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 12 })
  ).map(([prefix, digits]) => prefix + digits);

  test('NCCO is a 3-element array with actions in order: record, talk, connect', () => {
    fc.assert(
      fc.property(
        patientNumberArb,
        voiceTierArb,
        transcriptionProviderArb,
        amdEnabledArb,
        (patientNumber, voiceTier, transcriptionProvider, amdEnabled) => {
          const ncco = buildHcpNcco(patientNumber, voiceTier, transcriptionProvider, amdEnabled);

          // NCCO must be exactly 3 elements
          expect(ncco).toHaveLength(3);

          // Actions must be in order: record, talk, connect
          expect(ncco[0].action).toBe('record');
          expect(ncco[1].action).toBe('talk');
          expect(ncco[2].action).toBe('connect');
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: simple-proxy-recording, Property 7: Connect action structural invariants
 *
 * **Validates: Requirements 2.6, 2.7, 8.1, 10.2**
 *
 * For any patient phone number and any call configuration (any voice tier,
 * any provider, any AMD setting), the connect action SHALL always include
 * `from: LVN_B`, an `onAnswer` object with a valid URL, and a `ringbackTone`
 * URL within the onAnswer object.
 */
describe('Property 7: Connect action structural invariants', () => {
  // Generators
  const patientNumberArb = fc.tuple(
    fc.constantFrom('+1', '+33', '+44', '+49', '+61', '+81', '+86', '+91'),
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 12 })
  ).map(([prefix, digits]) => prefix + digits);
  const voiceTierArb = fc.constantFrom('standard', 'premium', 'premier');
  const transcriptionProviderArb = fc.constantFrom('none', 'vonage', 'deepgram', 'deepgram-medical', 'aws');
  const amdEnabledArb = fc.boolean();

  test('connect action `from` is always LVN_B (+440000000002)', () => {
    fc.assert(
      fc.property(
        patientNumberArb,
        voiceTierArb,
        transcriptionProviderArb,
        amdEnabledArb,
        (patientNumber, voiceTier, transcriptionProvider, amdEnabled) => {
          const ncco = buildHcpNcco(patientNumber, voiceTier, transcriptionProvider, amdEnabled);
          const connect = ncco[2];

          expect(connect.from).toBe('+440000000002');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('connect action endpoint[0].onAnswer.url contains /ncco/patient', () => {
    fc.assert(
      fc.property(
        patientNumberArb,
        voiceTierArb,
        transcriptionProviderArb,
        amdEnabledArb,
        (patientNumber, voiceTier, transcriptionProvider, amdEnabled) => {
          const ncco = buildHcpNcco(patientNumber, voiceTier, transcriptionProvider, amdEnabled);
          const connect = ncco[2];

          expect(connect.endpoint[0].onAnswer).toBeDefined();
          expect(typeof connect.endpoint[0].onAnswer.url).toBe('string');
          expect(connect.endpoint[0].onAnswer.url).toContain('/ncco/patient');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('connect action endpoint[0].onAnswer.ringbackTone contains /audio/hold-music', () => {
    fc.assert(
      fc.property(
        patientNumberArb,
        voiceTierArb,
        transcriptionProviderArb,
        amdEnabledArb,
        (patientNumber, voiceTier, transcriptionProvider, amdEnabled) => {
          const ncco = buildHcpNcco(patientNumber, voiceTier, transcriptionProvider, amdEnabled);
          const connect = ncco[2];

          expect(connect.endpoint[0].onAnswer).toBeDefined();
          expect(typeof connect.endpoint[0].onAnswer.ringbackTone).toBe('string');
          expect(connect.endpoint[0].onAnswer.ringbackTone).toContain('/audio/hold-music');
        }
      ),
      { numRuns: 100 }
    );
  });
});
