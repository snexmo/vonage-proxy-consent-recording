'use strict';

const fc = require('fast-check');
const { buildTranscriptionConfigNcco } = require('./transcription');

/**
 * Feature: simple-proxy-recording, Property 2: Transcription config provider correctness
 *
 * For any selected transcription provider (vonage, deepgram, deepgram-medical, aws)
 * and any valid BCP-47 language code, the generated transcription config SHALL include
 * the correct `provider` field value, the correct model name in `providerOptions`,
 * and shall use camelCase keys (`eventUrl`, `eventMethod`, `providerOptions`) throughout.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

// Generator for BCP-47-like language codes (e.g., "en-US", "fr-FR", "de-DE")
const bcp47LanguageArb = fc.tuple(
  fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'), { minLength: 2, maxLength: 3 }),
  fc.stringOf(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'), { minLength: 2, maxLength: 2 })
).map(([lang, region]) => `${lang}-${region}`);

// Generator for valid HTTPS event URLs
const eventUrlArb = fc.webUrl({ withFragments: false, withQueryParameters: false })
  .map(url => url.replace(/^http:/, 'https:'));

// Generator for non-none providers
const providerArb = fc.constantFrom('vonage', 'deepgram', 'deepgram-medical', 'aws');

/**
 * Helper: recursively checks that an object has no snake_case keys.
 * Only top-level and nested object keys are checked (not string values).
 */
function allKeysCamelCase(obj) {
  if (obj === null || typeof obj !== 'object') return true;
  if (Array.isArray(obj)) return obj.every(allKeysCamelCase);
  for (const key of Object.keys(obj)) {
    // snake_case detection: contains underscore (but allow keys like LanguageCode or ChannelIdentification)
    // The spec says camelCase for the transcription config keys (eventUrl, eventMethod, providerOptions)
    // AWS providerOptions use PascalCase (LanguageCode, Settings, ChannelIdentification) which is fine
    if (key.includes('_')) return false;
    if (!allKeysCamelCase(obj[key])) return false;
  }
  return true;
}

describe('Feature: simple-proxy-recording, Property 2: Transcription config provider correctness', () => {

  it('vonage provider: has language, eventUrl (array), eventMethod, no provider field', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('vonage', eventUrl, language);

          // Must have language matching input
          expect(config.language).toBe(language);
          // eventUrl must be an array containing the URL
          expect(Array.isArray(config.eventUrl)).toBe(true);
          expect(config.eventUrl).toContain(eventUrl);
          // eventMethod must be POST
          expect(config.eventMethod).toBe('POST');
          // No provider field for vonage
          expect(config).not.toHaveProperty('provider');
          // All keys must be camelCase (no snake_case)
          expect(allKeysCamelCase(config)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deepgram provider: provider is "deepgram", model is "nova-2-phonecall", has language/diarize/punctuate/smart_format in providerOptions', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('deepgram', eventUrl, language);

          // Provider field
          expect(config.provider).toBe('deepgram');
          // eventUrl/eventMethod
          expect(Array.isArray(config.eventUrl)).toBe(true);
          expect(config.eventUrl).toContain(eventUrl);
          expect(config.eventMethod).toBe('POST');
          // providerOptions
          expect(config.providerOptions).toBeDefined();
          expect(config.providerOptions.model).toBe('nova-2-phonecall');
          expect(config.providerOptions.language).toBe(language);
          expect(config.providerOptions.diarize).toBe(true);
          expect(config.providerOptions.punctuate).toBe(true);
          expect(config.providerOptions.smart_format).toBe(true);
          // Top-level keys must be camelCase (eventUrl, eventMethod, providerOptions)
          const topKeys = Object.keys(config);
          expect(topKeys).toContain('eventUrl');
          expect(topKeys).toContain('eventMethod');
          expect(topKeys).toContain('providerOptions');
          expect(topKeys).not.toContain('event_url');
          expect(topKeys).not.toContain('event_method');
          expect(topKeys).not.toContain('provider_options');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deepgram-medical provider: provider is "deepgram", model is "nova-3-medical"', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('deepgram-medical', eventUrl, language);

          // Provider field — still "deepgram" (the model distinguishes medical)
          expect(config.provider).toBe('deepgram');
          // eventUrl/eventMethod
          expect(Array.isArray(config.eventUrl)).toBe(true);
          expect(config.eventUrl).toContain(eventUrl);
          expect(config.eventMethod).toBe('POST');
          // providerOptions
          expect(config.providerOptions).toBeDefined();
          expect(config.providerOptions.model).toBe('nova-3-medical');
          expect(config.providerOptions.language).toBe(language);
          expect(config.providerOptions.diarize).toBe(true);
          expect(config.providerOptions.punctuate).toBe(true);
          expect(config.providerOptions.smart_format).toBe(true);
          // Top-level keys must be camelCase
          const topKeys = Object.keys(config);
          expect(topKeys).toContain('eventUrl');
          expect(topKeys).toContain('eventMethod');
          expect(topKeys).toContain('providerOptions');
          expect(topKeys).not.toContain('event_url');
          expect(topKeys).not.toContain('event_method');
          expect(topKeys).not.toContain('provider_options');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('aws provider: provider is "aws", has providerOptions.LanguageCode and providerOptions.Settings.ChannelIdentification', () => {
    fc.assert(
      fc.property(
        bcp47LanguageArb,
        eventUrlArb,
        (language, eventUrl) => {
          const config = buildTranscriptionConfigNcco('aws', eventUrl, language);

          // Provider field
          expect(config.provider).toBe('aws');
          // eventUrl/eventMethod
          expect(Array.isArray(config.eventUrl)).toBe(true);
          expect(config.eventUrl).toContain(eventUrl);
          expect(config.eventMethod).toBe('POST');
          // providerOptions
          expect(config.providerOptions).toBeDefined();
          expect(config.providerOptions.LanguageCode).toBe(language);
          expect(config.providerOptions.Settings).toBeDefined();
          expect(config.providerOptions.Settings.ChannelIdentification).toBe(true);
          // Top-level keys must be camelCase
          const topKeys = Object.keys(config);
          expect(topKeys).toContain('eventUrl');
          expect(topKeys).toContain('eventMethod');
          expect(topKeys).toContain('providerOptions');
          expect(topKeys).not.toContain('event_url');
          expect(topKeys).not.toContain('event_method');
          expect(topKeys).not.toContain('provider_options');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all providers produce configs with camelCase keys throughout', () => {
    fc.assert(
      fc.property(
        providerArb,
        bcp47LanguageArb,
        eventUrlArb,
        (provider, language, eventUrl) => {
          const config = buildTranscriptionConfigNcco(provider, eventUrl, language);

          // config should not be null for non-none providers
          expect(config).not.toBeNull();
          // Top-level keys must be camelCase
          const topKeys = Object.keys(config);
          expect(topKeys).not.toContain('event_url');
          expect(topKeys).not.toContain('event_method');
          expect(topKeys).not.toContain('provider_options');
          // All keys in the config tree must be camelCase
          // (except providerOptions internal keys like smart_format which are provider-specific param names)
          expect(topKeys.every(k => !k.includes('_'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
