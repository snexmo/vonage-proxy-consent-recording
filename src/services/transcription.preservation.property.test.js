'use strict';

const fc = require('fast-check');
const { buildTranscriptionConfigNcco } = require('./transcription');

/**
 * Preservation Property Tests (BEFORE implementing fix)
 *
 * Property 2: Preservation — Deepgram-Medical, Vonage, AWS, and None Providers Unchanged
 *
 * These tests observe and assert the current (unfixed) behavior for all providers
 * EXCEPT standard "deepgram". They confirm the baseline that must be preserved
 * after the bugfix is applied.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
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

// Generator for unknown provider names (not matching any valid provider)
const unknownProviderArb = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'),
  { minLength: 1, maxLength: 10 }
).filter(s => !['vonage', 'deepgram', 'aws', 'none'].includes(s) && !s.startsWith('deepgram'));

describe('Preservation Property Tests: Non-standard-deepgram providers unchanged', () => {

  /**
   * **Validates: Requirements 3.1**
   *
   * For all (language, eventUrl), deepgram-medical model === 'nova-3-medical'
   */
  it('deepgram-medical: model is always "nova-3-medical" for all inputs', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('deepgram-medical', eventUrl, language);

          expect(config).not.toBeNull();
          expect(config.provider).toBe('deepgram');
          expect(config.providerOptions).toBeDefined();
          expect(config.providerOptions.model).toBe('nova-3-medical');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * For all (language, eventUrl), vonage has no provider/providerOptions fields and language matches input
   */
  it('vonage: has language matching input, no provider or providerOptions fields', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('vonage', eventUrl, language);

          expect(config).not.toBeNull();
          // Language matches input exactly
          expect(config.language).toBe(language);
          // eventUrl is an array containing the input URL
          expect(Array.isArray(config.eventUrl)).toBe(true);
          expect(config.eventUrl).toContain(eventUrl);
          // eventMethod is POST
          expect(config.eventMethod).toBe('POST');
          // No provider or providerOptions fields
          expect(config).not.toHaveProperty('provider');
          expect(config).not.toHaveProperty('providerOptions');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * For all (language, eventUrl), aws providerOptions.LanguageCode === language
   */
  it('aws: providerOptions.LanguageCode matches language input, Settings.ChannelIdentification is true', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('aws', eventUrl, language);

          expect(config).not.toBeNull();
          expect(config.provider).toBe('aws');
          expect(config.providerOptions).toBeDefined();
          expect(config.providerOptions.LanguageCode).toBe(language);
          expect(config.providerOptions.Settings).toBeDefined();
          expect(config.providerOptions.Settings.ChannelIdentification).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * For all (language, eventUrl), none returns null
   */
  it('none: always returns null for all inputs', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('none', eventUrl, language);

          expect(config).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * Unknown providers throw an error
   */
  it('unknown providers: always throw an error', () => {
    fc.assert(
      fc.property(
        unknownProviderArb,
        bcp47LanguageArb,
        eventUrlArb,
        (provider, language, eventUrl) => {
          expect(() => {
            buildTranscriptionConfigNcco(provider, eventUrl, language);
          }).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
