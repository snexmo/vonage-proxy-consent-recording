'use strict';

/**
 * TTS (Text-to-Speech) Helper Module
 *
 * Generates correctly-structured NCCO `talk` action objects for the three
 * supported voice tiers:
 *
 *   - "standard" — Neural TTS using `language` + `style` parameters
 *   - "premium"  — Higher-quality Neural TTS using `language` + `style` + `premium: true`
 *   - "premier"  — Google Chirp3 HD generative AI engine using `provider` + `providerOptions`
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ IMPORTANT — Premier Voices (NEW FEATURE)                               │
 * │                                                                         │
 * │ Premier voices use Google's Chirp3 HD generative AI engine and are      │
 * │ configured DIFFERENTLY from Standard/Premium voices:                    │
 * │                                                                         │
 * │   • Use `provider` + `providerOptions` (NOT `language` or `style`)      │
 * │   • Mixing Premier params with Standard/Premium params causes the       │
 * │     NCCO to FAIL immediately                                            │
 * │   • Premier voices are a chargeable feature — see pricing page          │
 * │   • Voice names follow the pattern: {lang}-Chirp3-HD-{VoiceName}       │
 * │                                                                         │
 * │ See: https://cloud.google.com/text-to-speech/docs/chirp3-hd            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// Default voice configuration per tier
const VOICE_DEFAULTS = {
  standard: {
    language: 'fr-FR',
    style: 0,
  },
  premium: {
    language: 'fr-FR',
    style: 0,
  },
  premier: {
    provider: 'google',
    providerOptions: {
      // Aoede is a female French voice — suitable for healthcare IVR
      name: 'fr-FR-Chirp3-HD-Aoede',
      language_code: 'fr-FR',
    },
  },
};

/**
 * Build a `talk` NCCO action with the correct parameters for the selected voice tier.
 *
 * @param {string} text - The text (plain or SSML) to synthesize.
 * @param {string} voiceTier - One of: "standard", "premium", "premier".
 * @param {object} [options] - Additional talk action options (bargeIn, loop, level).
 * @returns {object} A fully-formed NCCO talk action object.
 *
 * @example
 * // Standard voice
 * buildTalkAction('Bonjour', 'standard')
 * // => { action: 'talk', text: 'Bonjour', language: 'fr-FR', style: 0 }
 *
 * @example
 * // Premier voice (Chirp3 HD)
 * buildTalkAction('Bonjour', 'premier', { bargeIn: true })
 * // => { action: 'talk', text: 'Bonjour', provider: 'google',
 * //      providerOptions: { name: 'fr-FR-Chirp3-HD-Aoede', language_code: 'fr-FR' },
 * //      bargeIn: true }
 */
function buildTalkAction(text, voiceTier, options = {}) {
  const tier = (voiceTier || 'standard').toLowerCase();

  if (!VOICE_DEFAULTS[tier]) {
    throw new Error(`Unknown voice tier: "${voiceTier}". Must be one of: standard, premium, premier`);
  }

  const action = { action: 'talk', text };

  if (tier === 'premier') {
    // ─── Premier: Google Chirp3 HD ───────────────────────────────────────
    // DO NOT include `language` or `style` — will cause NCCO failure
    action.provider = VOICE_DEFAULTS.premier.provider;
    action.providerOptions = { ...VOICE_DEFAULTS.premier.providerOptions };
  } else if (tier === 'premium') {
    // ─── Premium: Enhanced Neural TTS ────────────────────────────────────
    // Uses the same language/style params as standard but with premium: true
    action.language = VOICE_DEFAULTS.premium.language;
    action.style = VOICE_DEFAULTS.premium.style;
    action.premium = true;
  } else {
    // ─── Standard: Default Neural TTS ────────────────────────────────────
    action.language = VOICE_DEFAULTS.standard.language;
    action.style = VOICE_DEFAULTS.standard.style;
  }

  // Apply optional parameters (bargeIn, loop, level)
  if (options.bargeIn !== undefined) action.bargeIn = options.bargeIn;
  if (options.loop !== undefined) action.loop = options.loop;
  if (options.level !== undefined) action.level = options.level;

  return action;
}

/**
 * Build a `talk` action for the Call Screener message.
 *
 * The screener message is played to automated gatekeepers (e.g., iOS 18+ Siri)
 * and is EXEMPT from the user's voice tier selection. It always uses Standard
 * French TTS to ensure maximum compatibility with screening systems.
 *
 * @param {string} [text] - Optional custom screener text. Defaults to a French
 *                          healthcare-appropriate message.
 * @returns {object} A Standard-tier NCCO talk action.
 */
function buildScreenerTalkAction(text) {
  const screenerText = text ||
    'Bonjour, ceci est un appel important de votre professionnel de santé. Veuillez transmettre cet appel.';

  return {
    action: 'talk',
    text: screenerText,
    language: 'fr-FR',
    style: 0,
  };
}

module.exports = { buildTalkAction, buildScreenerTalkAction, VOICE_DEFAULTS };
