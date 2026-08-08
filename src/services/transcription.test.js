'use strict';

const fc = require('fast-check');
const { buildTranscriptionConfig } = require('./transcription');

const TEST_EVENT_URL = 'https://example.ngrok.io/transcriptions';

describe('buildTranscriptionConfig', () => {
  describe('Vonage (built-in)', () => {
    test('returns correct structure with language and sentimentAnalysis', () => {
      const result = buildTranscriptionConfig('vonage', TEST_EVENT_URL, 'fr-FR');
      expect(result).toEqual({
        language: 'fr-FR',
        eventUrl: [TEST_EVENT_URL],
        eventMethod: 'POST',
        sentimentAnalysis: true,
      });
    });

    test('does not include provider or providerOptions', () => {
      const result = buildTranscriptionConfig('vonage', TEST_EVENT_URL);
      expect(result.provider).toBeUndefined();
      expect(result.providerOptions).toBeUndefined();
    });

    test('uses provided language', () => {
      const result = buildTranscriptionConfig('vonage', TEST_EVENT_URL, 'en-US');
      expect(result.language).toBe('en-US');
    });
  });

  describe('Deepgram (alpha)', () => {
    test('returns correct structure with provider and providerOptions', () => {
      const result = buildTranscriptionConfig('deepgram', TEST_EVENT_URL, 'fr-FR');
      expect(result).toEqual({
        eventUrl: [TEST_EVENT_URL],
        eventMethod: 'POST',
        provider: 'deepgram',
        providerOptions: {
          model: 'nova-2-phonecall',
          language: 'fr-FR',
          diarize: true,
          diarize_model: 'latest',
          punctuate: true,
          smart_format: true,
          utterances: true,
        },
      });
    });

    test('does not include top-level language or sentimentAnalysis', () => {
      const result = buildTranscriptionConfig('deepgram', TEST_EVENT_URL);
      expect(result.language).toBeUndefined();
      expect(result.sentimentAnalysis).toBeUndefined();
    });

    test('passes language into providerOptions', () => {
      const result = buildTranscriptionConfig('deepgram', TEST_EVENT_URL, 'en-US');
      expect(result.providerOptions.language).toBe('en-US');
    });
  });

  describe('AWS Transcribe (alpha)', () => {
    test('returns correct structure with provider and providerOptions', () => {
      const result = buildTranscriptionConfig('aws', TEST_EVENT_URL, 'fr-FR');
      expect(result).toEqual({
        eventUrl: [TEST_EVENT_URL],
        eventMethod: 'POST',
        provider: 'aws',
        providerOptions: {
          LanguageCode: 'fr-FR',
          Settings: {
            ChannelIdentification: true,
          },
        },
      });
    });

    test('does not include top-level language or sentimentAnalysis', () => {
      const result = buildTranscriptionConfig('aws', TEST_EVENT_URL);
      expect(result.language).toBeUndefined();
      expect(result.sentimentAnalysis).toBeUndefined();
    });

    test('passes language into providerOptions.LanguageCode', () => {
      const result = buildTranscriptionConfig('aws', TEST_EVENT_URL, 'en-US');
      expect(result.providerOptions.LanguageCode).toBe('en-US');
    });
  });

  describe('None', () => {
    test('returns null', () => {
      const result = buildTranscriptionConfig('none', TEST_EVENT_URL);
      expect(result).toBeNull();
    });

    test('returns null for undefined provider', () => {
      const result = buildTranscriptionConfig(undefined, TEST_EVENT_URL);
      expect(result).toBeNull();
    });

    test('returns null for null provider', () => {
      const result = buildTranscriptionConfig(null, TEST_EVENT_URL);
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    test('is case-insensitive', () => {
      expect(buildTranscriptionConfig('DEEPGRAM', TEST_EVENT_URL).provider).toBe('deepgram');
      expect(buildTranscriptionConfig('AWS', TEST_EVENT_URL).provider).toBe('aws');
      expect(buildTranscriptionConfig('Vonage', TEST_EVENT_URL).language).toBe('fr-FR');
    });

    test('defaults language to fr-FR when not provided', () => {
      const vonage = buildTranscriptionConfig('vonage', TEST_EVENT_URL);
      expect(vonage.language).toBe('fr-FR');

      const deepgram = buildTranscriptionConfig('deepgram', TEST_EVENT_URL);
      expect(deepgram.providerOptions.language).toBe('fr-FR');

      const aws = buildTranscriptionConfig('aws', TEST_EVENT_URL);
      expect(aws.providerOptions.LanguageCode).toBe('fr-FR');
    });

    test('throws on unknown provider', () => {
      expect(() => buildTranscriptionConfig('whisper', TEST_EVENT_URL))
        .toThrow('Unknown transcription provider: "whisper"');
    });

    test('eventUrl is always wrapped in an array', () => {
      for (const p of ['vonage', 'deepgram', 'aws']) {
        const result = buildTranscriptionConfig(p, TEST_EVENT_URL);
        expect(result.eventUrl).toEqual([TEST_EVENT_URL]);
      }
    });
  });
});

/**
 * Property: Third-party providers (deepgram, aws) always include
 * `provider` and `providerOptions` fields.
 */
describe('Property: Third-party providers always include provider and providerOptions', () => {
  test('deepgram and aws always have provider + providerOptions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('deepgram', 'aws'),
        fc.webUrl(),
        fc.constantFrom('fr-FR', 'en-US', 'de-DE', 'es-ES'),
        (provider, url, lang) => {
          const result = buildTranscriptionConfig(provider, url, lang);
          expect(result).not.toBeNull();
          expect(result.provider).toBe(provider);
          expect(result.providerOptions).toBeDefined();
          expect(typeof result.providerOptions).toBe('object');
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property: Vonage provider NEVER includes `provider` or `providerOptions`.
 */
describe('Property: Vonage provider never includes provider or providerOptions', () => {
  test('vonage config never has provider/providerOptions for any language', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.constantFrom('fr-FR', 'en-US', 'de-DE', 'es-ES', 'ja-JP'),
        (url, lang) => {
          const result = buildTranscriptionConfig('vonage', url, lang);
          expect(result.provider).toBeUndefined();
          expect(result.providerOptions).toBeUndefined();
          expect(result.language).toBe(lang);
          expect(result.sentimentAnalysis).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property: "none" always returns null regardless of other params.
 */
describe('Property: None always returns null', () => {
  test('none returns null for any eventUrl and language', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string(),
        (url, lang) => {
          const result = buildTranscriptionConfig('none', url, lang);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});
