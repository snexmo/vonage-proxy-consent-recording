'use strict';

const fc = require('fast-check');
const { buildTranscriptionConfig, buildTranscriptionConfigRest } = require('./transcription');

const TEST_EVENT_URL = 'https://example.ngrok.io/transcriptions';

describe('buildTranscriptionConfig', () => {
  describe('Vonage (built-in)', () => {
    test('returns correct structure with language', () => {
      const result = buildTranscriptionConfig('vonage', TEST_EVENT_URL, 'fr-FR');
      expect(result).toEqual({
        language: 'fr-FR',
        eventUrl: [TEST_EVENT_URL],
        eventMethod: 'POST',
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

  // ─── Coming in a future release (requires NCCO-based recording path) ───
  // describe('Deepgram (alpha)', () => {
  //   test('returns correct structure with provider and providerOptions', () => {
  //     const result = buildTranscriptionConfig('deepgram', TEST_EVENT_URL, 'fr-FR');
  //     expect(result).toEqual({
  //       eventUrl: [TEST_EVENT_URL],
  //       eventMethod: 'POST',
  //       provider: 'deepgram',
  //       providerOptions: {
  //         model: 'nova-2-phonecall',
  //         language: 'fr-FR',
  //         diarize: true,
  //         diarize_model: 'latest',
  //         punctuate: true,
  //         smart_format: true,
  //         utterances: true,
  //       },
  //     });
  //   });
  //
  //   test('does not include top-level language', () => {
  //     const result = buildTranscriptionConfig('deepgram', TEST_EVENT_URL);
  //     expect(result.language).toBeUndefined();
  //   });
  //
  //   test('passes language into providerOptions', () => {
  //     const result = buildTranscriptionConfig('deepgram', TEST_EVENT_URL, 'en-US');
  //     expect(result.providerOptions.language).toBe('en-US');
  //   });
  // });

  // describe('AWS Transcribe (alpha)', () => {
  //   test('returns correct structure with provider and providerOptions', () => {
  //     const result = buildTranscriptionConfig('aws', TEST_EVENT_URL, 'fr-FR');
  //     expect(result).toEqual({
  //       eventUrl: [TEST_EVENT_URL],
  //       eventMethod: 'POST',
  //       provider: 'aws',
  //       providerOptions: {
  //         LanguageCode: 'fr-FR',
  //         Settings: {
  //           ChannelIdentification: true,
  //         },
  //       },
  //     });
  //   });
  //
  //   test('does not include top-level language', () => {
  //     const result = buildTranscriptionConfig('aws', TEST_EVENT_URL);
  //     expect(result.language).toBeUndefined();
  //   });
  //
  //   test('passes language into providerOptions.LanguageCode', () => {
  //     const result = buildTranscriptionConfig('aws', TEST_EVENT_URL, 'en-US');
  //     expect(result.providerOptions.LanguageCode).toBe('en-US');
  //   });
  // });

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
    // ─── Coming in a future release (requires NCCO-based recording path) ───
    // test('is case-insensitive', () => {
    //   expect(buildTranscriptionConfig('DEEPGRAM', TEST_EVENT_URL).provider).toBe('deepgram');
    //   expect(buildTranscriptionConfig('AWS', TEST_EVENT_URL).provider).toBe('aws');
    //   expect(buildTranscriptionConfig('Vonage', TEST_EVENT_URL).language).toBe('fr-FR');
    // });

    test('is case-insensitive for vonage', () => {
      expect(buildTranscriptionConfig('Vonage', TEST_EVENT_URL).language).toBe('fr-FR');
    });

    test('defaults language to fr-FR when not provided', () => {
      const vonage = buildTranscriptionConfig('vonage', TEST_EVENT_URL);
      expect(vonage.language).toBe('fr-FR');

      // ─── Coming in a future release ───
      // const deepgram = buildTranscriptionConfig('deepgram', TEST_EVENT_URL);
      // expect(deepgram.providerOptions.language).toBe('fr-FR');
      //
      // const aws = buildTranscriptionConfig('aws', TEST_EVENT_URL);
      // expect(aws.providerOptions.LanguageCode).toBe('fr-FR');
    });

    test('throws on unknown provider', () => {
      expect(() => buildTranscriptionConfig('whisper', TEST_EVENT_URL))
        .toThrow('Unknown transcription provider: "whisper"');
    });

    test('eventUrl is always wrapped in an array', () => {
      // ─── Coming in a future release: deepgram, aws ───
      for (const p of ['vonage']) {
        const result = buildTranscriptionConfig(p, TEST_EVENT_URL);
        expect(result.eventUrl).toEqual([TEST_EVENT_URL]);
      }
    });
  });
});

// ─── Coming in a future release (requires NCCO-based recording path) ───
// /**
//  * Property: Third-party providers (deepgram, aws) always include
//  * `provider` and `providerOptions` fields.
//  */
// describe('Property: Third-party providers always include provider and providerOptions', () => {
//   test('deepgram and aws always have provider + providerOptions', () => {
//     fc.assert(
//       fc.property(
//         fc.constantFrom('deepgram', 'aws'),
//         fc.webUrl(),
//         fc.constantFrom('fr-FR', 'en-US', 'de-DE', 'es-ES'),
//         (provider, url, lang) => {
//           const result = buildTranscriptionConfig(provider, url, lang);
//           expect(result).not.toBeNull();
//           expect(result.provider).toBe(provider);
//           expect(result.providerOptions).toBeDefined();
//           expect(typeof result.providerOptions).toBe('object');
//         }
//       ),
//       { numRuns: 50 }
//     );
//   });
// });

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
          expect(result.sentimentAnalysis).toBeUndefined();
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


describe('buildTranscriptionConfigRest', () => {
  const TEST_URL = 'https://example.ngrok.io/transcriptions';

  describe('"none" provider', () => {
    test('returns null', () => {
      const result = buildTranscriptionConfigRest('none', TEST_URL);
      expect(result).toBeNull();
    });
  });

  describe('"vonage" provider', () => {
    test('returns correct structure with snake_case fields', () => {
      const result = buildTranscriptionConfigRest('vonage', TEST_URL, 'fr-FR');
      expect(result).toEqual({
        language: 'fr-FR',
        event_url: [TEST_URL],
        event_method: 'POST',
      });
    });

    test('does NOT use camelCase keys', () => {
      const result = buildTranscriptionConfigRest('vonage', TEST_URL, 'fr-FR');
      expect(result.eventUrl).toBeUndefined();
      expect(result.eventMethod).toBeUndefined();
      expect(result.providerOptions).toBeUndefined();
    });
  });

  // ─── Coming in a future release (requires NCCO-based recording path) ───
  // describe('"deepgram" provider', () => {
  //   test('returns correct structure with provider and provider_options', () => {
  //     const result = buildTranscriptionConfigRest('deepgram', TEST_URL, 'fr-FR');
  //     expect(result.event_url).toEqual([TEST_URL]);
  //     expect(result.event_method).toBe('POST');
  //     expect(result.provider).toBe('deepgram');
  //     expect(result.provider_options.model).toBe('nova-2-phonecall');
  //   });
  //
  //   test('does NOT use camelCase keys', () => {
  //     const result = buildTranscriptionConfigRest('deepgram', TEST_URL, 'fr-FR');
  //     expect(result.eventUrl).toBeUndefined();
  //     expect(result.eventMethod).toBeUndefined();
  //     expect(result.providerOptions).toBeUndefined();
  //   });
  // });

  // describe('"deepgram-medical" provider', () => {
  //   test('returns provider "deepgram" with model "nova-3-medical"', () => {
  //     const result = buildTranscriptionConfigRest('deepgram-medical', TEST_URL, 'fr-FR');
  //     expect(result.event_url).toEqual([TEST_URL]);
  //     expect(result.event_method).toBe('POST');
  //     expect(result.provider).toBe('deepgram');
  //     expect(result.provider_options.model).toBe('nova-3-medical');
  //   });
  //
  //   test('does NOT use camelCase keys', () => {
  //     const result = buildTranscriptionConfigRest('deepgram-medical', TEST_URL, 'fr-FR');
  //     expect(result.eventUrl).toBeUndefined();
  //     expect(result.eventMethod).toBeUndefined();
  //     expect(result.providerOptions).toBeUndefined();
  //   });
  // });

  // describe('"aws" provider', () => {
  //   test('returns provider "aws" with provider_options containing LanguageCode and Settings', () => {
  //     const result = buildTranscriptionConfigRest('aws', TEST_URL, 'fr-FR');
  //     expect(result.event_url).toEqual([TEST_URL]);
  //     expect(result.event_method).toBe('POST');
  //     expect(result.provider).toBe('aws');
  //     expect(result.provider_options.LanguageCode).toBe('fr-FR');
  //     expect(result.provider_options.Settings).toEqual({ ChannelIdentification: true });
  //   });
  //
  //   test('does NOT use camelCase keys', () => {
  //     const result = buildTranscriptionConfigRest('aws', TEST_URL, 'fr-FR');
  //     expect(result.eventUrl).toBeUndefined();
  //     expect(result.eventMethod).toBeUndefined();
  //     expect(result.providerOptions).toBeUndefined();
  //   });
  // });
});


describe('buildTranscriptionConfigNcco', () => {
  const { buildTranscriptionConfigNcco } = require('./transcription');
  const TEST_URL = 'https://example.ngrok.io/transcriptions';

  describe('"vonage" provider', () => {
    test('returns correct structure with language and camelCase keys', () => {
      const result = buildTranscriptionConfigNcco('vonage', TEST_URL, 'fr-FR');
      expect(result).toEqual({
        language: 'fr-FR',
        eventUrl: [TEST_URL],
        eventMethod: 'POST',
      });
    });

    test('does not include provider or providerOptions', () => {
      const result = buildTranscriptionConfigNcco('vonage', TEST_URL);
      expect(result.provider).toBeUndefined();
      expect(result.providerOptions).toBeUndefined();
    });

    test('defaults language to fr-FR', () => {
      const result = buildTranscriptionConfigNcco('vonage', TEST_URL);
      expect(result.language).toBe('fr-FR');
    });
  });

  describe('"deepgram" provider', () => {
    test('returns correct structure with provider and providerOptions', () => {
      const result = buildTranscriptionConfigNcco('deepgram', TEST_URL, 'fr-FR');
      expect(result).toEqual({
        eventUrl: [TEST_URL],
        eventMethod: 'POST',
        provider: 'deepgram',
        providerOptions: {
          model: 'nova-2-phonecall',
          language: 'fr-FR',
          diarize: true,
          punctuate: true,
          smart_format: true,
        },
      });
    });

    test('does NOT include top-level language', () => {
      const result = buildTranscriptionConfigNcco('deepgram', TEST_URL);
      expect(result.language).toBeUndefined();
    });

    test('passes language into providerOptions', () => {
      const result = buildTranscriptionConfigNcco('deepgram', TEST_URL, 'en-US');
      expect(result.providerOptions.language).toBe('en-US');
    });
  });

  describe('"deepgram-medical" provider', () => {
    test('returns provider "deepgram" with model "nova-3-medical"', () => {
      const result = buildTranscriptionConfigNcco('deepgram-medical', TEST_URL, 'fr-FR');
      expect(result).toEqual({
        eventUrl: [TEST_URL],
        eventMethod: 'POST',
        provider: 'deepgram',
        providerOptions: {
          model: 'nova-3-medical',
          language: 'fr-FR',
          diarize: true,
          punctuate: true,
          smart_format: true,
        },
      });
    });

    test('uses same camelCase keys as deepgram', () => {
      const result = buildTranscriptionConfigNcco('deepgram-medical', TEST_URL);
      expect(result.eventUrl).toBeDefined();
      expect(result.eventMethod).toBe('POST');
      expect(result.providerOptions).toBeDefined();
    });
  });

  describe('"aws" provider', () => {
    test('returns correct structure with provider and providerOptions', () => {
      const result = buildTranscriptionConfigNcco('aws', TEST_URL, 'fr-FR');
      expect(result).toEqual({
        eventUrl: [TEST_URL],
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

    test('does NOT include top-level language', () => {
      const result = buildTranscriptionConfigNcco('aws', TEST_URL);
      expect(result.language).toBeUndefined();
    });

    test('passes language into providerOptions.LanguageCode', () => {
      const result = buildTranscriptionConfigNcco('aws', TEST_URL, 'en-US');
      expect(result.providerOptions.LanguageCode).toBe('en-US');
    });
  });

  describe('"none" provider', () => {
    test('returns null', () => {
      const result = buildTranscriptionConfigNcco('none', TEST_URL);
      expect(result).toBeNull();
    });

    test('returns null for undefined provider', () => {
      const result = buildTranscriptionConfigNcco(undefined, TEST_URL);
      expect(result).toBeNull();
    });

    test('returns null for null provider', () => {
      const result = buildTranscriptionConfigNcco(null, TEST_URL);
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    test('is case-insensitive', () => {
      expect(buildTranscriptionConfigNcco('DEEPGRAM', TEST_URL).provider).toBe('deepgram');
      expect(buildTranscriptionConfigNcco('AWS', TEST_URL).provider).toBe('aws');
      expect(buildTranscriptionConfigNcco('Vonage', TEST_URL).language).toBe('fr-FR');
    });

    test('throws on unknown provider', () => {
      expect(() => buildTranscriptionConfigNcco('whisper', TEST_URL))
        .toThrow('Unknown transcription provider: "whisper"');
    });

    test('eventUrl is always wrapped in an array for all providers', () => {
      for (const p of ['vonage', 'deepgram', 'deepgram-medical', 'aws']) {
        const result = buildTranscriptionConfigNcco(p, TEST_URL);
        expect(result.eventUrl).toEqual([TEST_URL]);
      }
    });

    test('uses camelCase keys (not snake_case) for all providers', () => {
      for (const p of ['vonage', 'deepgram', 'deepgram-medical', 'aws']) {
        const result = buildTranscriptionConfigNcco(p, TEST_URL);
        expect(result.event_url).toBeUndefined();
        expect(result.event_method).toBeUndefined();
        expect(result.provider_options).toBeUndefined();
      }
    });
  });
});
