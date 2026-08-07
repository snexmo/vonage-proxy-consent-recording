const fc = require('fast-check');

// Mock config to avoid real port binding
jest.mock('../config', () => ({
  PORT: 0,  // Use port 0 to get a random available port
  BASE_URL: 'https://example.ngrok.io',
  LVN_A: '+440000000001',
  LVN_B: '+440000000002',
}));

// Mock vonage service to avoid real API calls
jest.mock('../services/vonage', () => ({
  createCall: jest.fn(),
  generateJwt: jest.fn(() => 'mock-jwt'),
}));

// Mock readline to prevent interactive prompts during test
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn(),
    close: jest.fn(),
  })),
}));

const { isValidE164, normalizeE164, server } = require('../index');

afterAll((done) => {
  if (server && server.close) {
    server.close(done);
  } else {
    done();
  }
});

/**
 * Property 6: E.164 validation accepts correct format only
 * Validates: Requirements 3.3
 */
describe('isValidE164', () => {
  // Unit tests for edge cases
  describe('edge cases', () => {
    test('returns false for empty string', () => {
      expect(isValidE164('')).toBe(false);
    });

    test('returns false for whitespace only', () => {
      expect(isValidE164(' ')).toBe(false);
      expect(isValidE164('  ')).toBe(false);
      expect(isValidE164('\t')).toBe(false);
    });

    test('returns false for missing + prefix', () => {
      expect(isValidE164('1234567890')).toBe(false);
    });

    test('returns false for letters mixed with digits', () => {
      expect(isValidE164('+123abc456')).toBe(false);
      expect(isValidE164('+abcdef')).toBe(false);
    });

    test('returns false for + alone', () => {
      expect(isValidE164('+')).toBe(false);
    });

    test('returns true for valid E.164 numbers', () => {
      expect(isValidE164('+1')).toBe(true);
      expect(isValidE164('+441234567890')).toBe(true);
      expect(isValidE164('+34123456789')).toBe(true);
    });
  });

  // Property-based test
  describe('property test', () => {
    /**
     * Property 6: E.164 validation accepts correct format only
     * Validates: Requirements 3.3
     *
     * For any string, isValidE164 returns true if and only if
     * the string matches /^\+\d+$/
     */
    test('returns true iff string matches /^\\+\\d+$/', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const expected = /^\+\d+$/.test(input);
          const actual = isValidE164(input);
          return actual === expected;
        }),
        { numRuns: 1000 }
      );
    });

    test('always returns true for valid E.164 strings (+ followed by digits)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 15 }).chain((len) =>
            fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: len, maxLength: len })
          ),
          (digits) => {
            return isValidE164('+' + digits) === true;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });
});

describe('normalizeE164', () => {
  describe('edge cases', () => {
    test('prepends + to digit-only input', () => {
      expect(normalizeE164('441234567890')).toBe('+441234567890');
      expect(normalizeE164('1')).toBe('+1');
    });

    test('leaves input unchanged if it already starts with +', () => {
      expect(normalizeE164('+441234567890')).toBe('+441234567890');
    });

    test('leaves input unchanged if it contains non-digit characters', () => {
      expect(normalizeE164('+123abc')).toBe('+123abc');
      expect(normalizeE164('abc')).toBe('abc');
    });

    test('leaves empty string unchanged', () => {
      expect(normalizeE164('')).toBe('');
    });
  });

  describe('property test', () => {
    test('digit-only strings always get + prepended', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 15 }).chain((len) =>
            fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: len, maxLength: len })
          ),
          (digits) => {
            return normalizeE164(digits) === '+' + digits;
          }
        ),
        { numRuns: 1000 }
      );
    });

    test('strings that already have + prefix are unchanged', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 15 }).chain((len) =>
            fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: len, maxLength: len })
          ),
          (digits) => {
            const withPlus = '+' + digits;
            return normalizeE164(withPlus) === withPlus;
          }
        ),
        { numRuns: 1000 }
      );
    });

    test('normalized digit-only input always passes isValidE164', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 15 }).chain((len) =>
            fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: len, maxLength: len })
          ),
          (digits) => {
            return isValidE164(normalizeE164(digits)) === true;
          }
        ),
        { numRuns: 1000 }
      );
    });
  });
});
