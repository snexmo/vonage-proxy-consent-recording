'use strict';

const fc = require('fast-check');
const { buildTranscriptionConfigNcco } = require('./transcription');

/**
 * Bug Condition Exploration Test
 *
 * Property 1: Standard Deepgram Model References "nova-3" (not the stale "nova-2-phonecall")
 *
 * This test asserts the CORRECT expected behavior: for the standard "deepgram" provider,
 * buildTranscriptionConfigNcco should return providerOptions.model === 'nova-3'.
 *
 * The implementation already returns 'nova-3', so this test is expected to PASS.
 * The bug is in the surrounding stale references (tests, JSDoc, CLI) that still say 'nova-2-phonecall'.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

// Generator for BCP-47-like language codes (e.g., "en-US", "fr-FR", "de-DE")
const bcp47LanguageArb = fc.tuple(
  fc.stringOf(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'),
    { minLength: 2, maxLength: 3 }
  ),
  fc.stringOf(
    fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'),
    { minLength: 2, maxLength: 2 }
  )
).map(([lang, region]) => `${lang}-${region}`);

// Generator for valid HTTPS event URLs
const eventUrlArb = fc.webUrl({ withFragments: false, withQueryParameters: false })
  .map(url => url.replace(/^http:/, 'https:'));

describe('Bug Condition Exploration: Standard Deepgram model is "nova-3"', () => {

  it('buildTranscriptionConfigNcco("deepgram", eventUrl, language) returns providerOptions.model === "nova-3" for all inputs', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('deepgram', eventUrl, language);

          // The standard deepgram provider MUST return model 'nova-3'
          expect(config).not.toBeNull();
          expect(config.provider).toBe('deepgram');
          expect(config.providerOptions).toBeDefined();
          expect(config.providerOptions.model).toBe('nova-3');
        }
      ),
      { numRuns: 100 }
    );
  });
});
