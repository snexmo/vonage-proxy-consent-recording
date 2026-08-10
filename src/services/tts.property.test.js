'use strict';

const fc = require('fast-check');
const { buildTalkAction } = require('./tts');

/**
 * Feature: simple-proxy-recording, Property 5: TTS voice tier parameter exclusivity
 *
 * For any voice tier selection and any text input, the generated talk action SHALL use
 * `language`+`style` parameters (without `provider`) for Standard/Premium, OR
 * `provider`+`providerOptions` parameters (without `language` or `style`) for Premier —
 * and SHALL never include parameters from both groups simultaneously.
 *
 * Validates: Requirements 11.1, 11.2, 11.3
 */

// Generator for voice tiers
const voiceTierArb = fc.constantFrom('standard', 'premium', 'premier');

// Generator for non-empty text strings
const textArb = fc.string({ minLength: 1, maxLength: 200 });

describe('Feature: simple-proxy-recording, Property 5: TTS voice tier parameter exclusivity', () => {

  it('Standard tier: has language and style, does NOT have provider or providerOptions', () => {
    fc.assert(
      fc.property(
        textArb,
        (text) => {
          const result = buildTalkAction(text, 'standard');

          // Must have language and style
          expect(result.language).toBe('fr-FR');
          expect(result.style).toBe(0);

          // Must NOT have provider or providerOptions
          expect(result).not.toHaveProperty('provider');
          expect(result).not.toHaveProperty('providerOptions');

          // Must have action: 'talk' and matching text
          expect(result.action).toBe('talk');
          expect(result.text).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Premium tier: has language, style, and premium: true, does NOT have provider or providerOptions', () => {
    fc.assert(
      fc.property(
        textArb,
        (text) => {
          const result = buildTalkAction(text, 'premium');

          // Must have language, style, and premium flag
          expect(result.language).toBe('fr-FR');
          expect(result.style).toBe(0);
          expect(result.premium).toBe(true);

          // Must NOT have provider or providerOptions
          expect(result).not.toHaveProperty('provider');
          expect(result).not.toHaveProperty('providerOptions');

          // Must have action: 'talk' and matching text
          expect(result.action).toBe('talk');
          expect(result.text).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Premier tier: has provider and providerOptions, does NOT have language or style', () => {
    fc.assert(
      fc.property(
        textArb,
        (text) => {
          const result = buildTalkAction(text, 'premier');

          // Must have provider and providerOptions
          expect(result.provider).toBe('google');
          expect(result.providerOptions).toBeDefined();
          expect(typeof result.providerOptions.name).toBe('string');
          expect(result.providerOptions.name).toContain('Chirp3-HD');

          // Must NOT have language, style, or premium
          expect(result).not.toHaveProperty('language');
          expect(result).not.toHaveProperty('style');
          expect(result).not.toHaveProperty('premium');

          // Must have action: 'talk' and matching text
          expect(result.action).toBe('talk');
          expect(result.text).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('All tiers: action is always "talk" and text matches input', () => {
    fc.assert(
      fc.property(
        voiceTierArb,
        textArb,
        (tier, text) => {
          const result = buildTalkAction(text, tier);

          expect(result.action).toBe('talk');
          expect(result.text).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Parameter groups are mutually exclusive across all tiers', () => {
    fc.assert(
      fc.property(
        voiceTierArb,
        textArb,
        (tier, text) => {
          const result = buildTalkAction(text, tier);

          const hasLanguageGroup = 'language' in result || 'style' in result;
          const hasProviderGroup = 'provider' in result || 'providerOptions' in result;

          // Exactly one group must be present, never both
          expect(hasLanguageGroup && hasProviderGroup).toBe(false);
          expect(hasLanguageGroup || hasProviderGroup).toBe(true);

          // Verify the correct group for each tier
          if (tier === 'premier') {
            expect(hasProviderGroup).toBe(true);
            expect(hasLanguageGroup).toBe(false);
          } else {
            expect(hasLanguageGroup).toBe(true);
            expect(hasProviderGroup).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
