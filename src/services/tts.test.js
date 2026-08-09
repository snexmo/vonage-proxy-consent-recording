'use strict';

const fc = require('fast-check');
const { buildTalkAction, buildScreenerTalkAction, VOICE_DEFAULTS } = require('./tts');

describe('buildTalkAction', () => {
  describe('Standard tier', () => {
    test('returns correct structure with language and style', () => {
      const result = buildTalkAction('Bonjour', 'standard');
      expect(result).toEqual({
        action: 'talk',
        text: 'Bonjour',
        language: 'fr-FR',
        style: 0,
      });
    });

    test('does not include premium flag', () => {
      const result = buildTalkAction('Test', 'standard');
      expect(result.premium).toBeUndefined();
    });

    test('does not include provider or providerOptions', () => {
      const result = buildTalkAction('Test', 'standard');
      expect(result.provider).toBeUndefined();
      expect(result.providerOptions).toBeUndefined();
    });
  });

  describe('Premium tier', () => {
    test('returns correct structure with language, style, and premium flag', () => {
      const result = buildTalkAction('Bonjour', 'premium');
      expect(result).toEqual({
        action: 'talk',
        text: 'Bonjour',
        language: 'fr-FR',
        style: 0,
        premium: true,
      });
    });

    test('does not include provider or providerOptions', () => {
      const result = buildTalkAction('Test', 'premium');
      expect(result.provider).toBeUndefined();
      expect(result.providerOptions).toBeUndefined();
    });
  });

  describe('Premier tier (Chirp3 HD)', () => {
    test('returns correct structure with provider and providerOptions', () => {
      const result = buildTalkAction('Bonjour', 'premier');
      expect(result).toEqual({
        action: 'talk',
        text: 'Bonjour',
        provider: 'google',
        providerOptions: {
          name: 'fr-FR-Chirp3-HD-Aoede',
          language_code: 'fr-FR',
        },
      });
    });

    test('does not include language or style', () => {
      const result = buildTalkAction('Test', 'premier');
      expect(result.language).toBeUndefined();
      expect(result.style).toBeUndefined();
    });

    test('does not include premium flag', () => {
      const result = buildTalkAction('Test', 'premier');
      expect(result.premium).toBeUndefined();
    });
  });

  describe('Options handling', () => {
    test('includes bargeIn when provided', () => {
      const result = buildTalkAction('Test', 'standard', { bargeIn: true });
      expect(result.bargeIn).toBe(true);
    });

    test('includes loop when provided', () => {
      const result = buildTalkAction('Test', 'standard', { loop: 3 });
      expect(result.loop).toBe(3);
    });

    test('includes level when provided', () => {
      const result = buildTalkAction('Test', 'premier', { level: 0.5 });
      expect(result.level).toBe(0.5);
    });

    test('applies options to all tiers', () => {
      for (const tier of ['standard', 'premium', 'premier']) {
        const result = buildTalkAction('Test', tier, { bargeIn: true, loop: 2 });
        expect(result.bargeIn).toBe(true);
        expect(result.loop).toBe(2);
      }
    });
  });

  describe('Defaults and edge cases', () => {
    test('defaults to standard when voiceTier is null', () => {
      const result = buildTalkAction('Test', null);
      expect(result.language).toBe('fr-FR');
      expect(result.provider).toBeUndefined();
    });

    test('defaults to standard when voiceTier is undefined', () => {
      const result = buildTalkAction('Test', undefined);
      expect(result.language).toBe('fr-FR');
    });

    test('is case-insensitive', () => {
      const result = buildTalkAction('Test', 'PREMIER');
      expect(result.provider).toBe('google');
    });

    test('throws on unknown tier', () => {
      expect(() => buildTalkAction('Test', 'ultra')).toThrow('Unknown voice tier');
    });
  });
});

describe('buildScreenerTalkAction', () => {
  test('returns Standard French TTS with default screener text', () => {
    const result = buildScreenerTalkAction();
    expect(result).toEqual({
      action: 'talk',
      text: 'Bonjour, ceci est un appel important de votre professionnel de santé. Veuillez transmettre cet appel.',
      language: 'fr-FR',
      style: 0,
    });
  });

  test('uses custom text when provided', () => {
    const result = buildScreenerTalkAction('Message personnalisé.');
    expect(result.text).toBe('Message personnalisé.');
  });

  test('never includes provider or providerOptions regardless of input', () => {
    const result = buildScreenerTalkAction();
    expect(result.provider).toBeUndefined();
    expect(result.providerOptions).toBeUndefined();
  });

  test('never includes premium flag', () => {
    const result = buildScreenerTalkAction();
    expect(result.premium).toBeUndefined();
  });
});

/**
 * Property: Premier actions NEVER contain `language` or `style`.
 * This is critical — mixing these params causes NCCO failure.
 */
describe('Property: Premier tier exclusivity', () => {
  test('Premier actions never contain language or style for any text', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (text) => {
          const result = buildTalkAction(text, 'premier');
          expect(result.language).toBeUndefined();
          expect(result.style).toBeUndefined();
          expect(result.premium).toBeUndefined();
          expect(result.provider).toBe('google');
          expect(result.providerOptions).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property: Standard/Premium actions NEVER contain `provider` or `providerOptions`.
 */
describe('Property: Standard/Premium tier exclusivity', () => {
  test('Standard/Premium actions never contain provider or providerOptions', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.constantFrom('standard', 'premium'),
        (text, tier) => {
          const result = buildTalkAction(text, tier);
          expect(result.provider).toBeUndefined();
          expect(result.providerOptions).toBeUndefined();
          expect(result.language).toBe('fr-FR');
          expect(result.style).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property: All tiers always produce action: "talk" with the input text.
 */
describe('Property: All tiers produce valid talk actions', () => {
  test('action is always "talk" and text is preserved', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.constantFrom('standard', 'premium', 'premier'),
        (text, tier) => {
          const result = buildTalkAction(text, tier);
          expect(result.action).toBe('talk');
          expect(result.text).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });
});
