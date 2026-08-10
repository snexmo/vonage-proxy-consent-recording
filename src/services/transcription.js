'use strict';

/**
 * Transcription Configuration Builder
 *
 * Generates the `transcription` object for the NCCO `conversation` action
 * based on the selected provider. This object is passed inside the
 * `conversation` action alongside `record: true`.
 *
 * Supported providers:
 *   - "vonage" — Built-in Vonage transcription (language)
 *   - "deepgram" — Third-party: Deepgram Nova (provider + providerOptions)
 *   - "aws" — Third-party: AWS Transcribe (provider + providerOptions)
 *   - "none" — No transcription (returns null)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ALPHA FEATURE — Third-Party Post-Call Transcription (APIVOICEF-755)    │
 * │                                                                         │
 * │ Deepgram and AWS transcription providers are configured via `provider`  │
 * │ and `providerOptions` inside the `transcription` object. When these     │
 * │ are set:                                                                │
 * │                                                                         │
 * │   • The existing `transcription.language` parameter is IGNORED            │
 * │   • Vonage returns the RAW, UNMODIFIED provider JSON response at        │
 * │     `transcription_url` — no remapping is performed                     │
 * │   • A maximum 2-hour transcription limit applies                        │
 * │   • Vonage downloads the recording and routes it to the provider —      │
 * │     you do NOT need to supply an S3 URI for AWS                         │
 * │                                                                         │
 * │ Using `split: "conversation"` on the record/conversation action is      │
 * │ strongly recommended for best diarization accuracy.                     │
 * │                                                                         │
 * │ Status: In progress (Q3 2026 PI). Verify GA availability before         │
 * │ relying on this in production.                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Build the transcription configuration object for a given provider.
 *
 * @param {string} provider - One of: "vonage", "none". ("deepgram", "aws" planned for future release.)
 * @param {string} eventUrl - Webhook URL to receive transcription completion events.
 * @param {string} [language="fr-FR"] - BCP-47 language code for the transcription.
 * @returns {object|null} A transcription config object, or null if provider is "none".
 *
 * @example
 * // Vonage built-in
 * buildTranscriptionConfig('vonage', 'https://example.com/tx', 'fr-FR')
 * // => { language: 'fr-FR', eventUrl: ['https://...'], eventMethod: 'POST' }
 *
 * @example
 * // Deepgram (alpha)
 * buildTranscriptionConfig('deepgram', 'https://example.com/tx', 'fr-FR')
 * // => { eventUrl: ['https://...'], eventMethod: 'POST',
 * //      provider: 'deepgram', providerOptions: { model: 'nova-3', ... } }
 */
function buildTranscriptionConfig(provider, eventUrl, language = 'fr-FR') {
  const normalizedProvider = (provider || 'none').toLowerCase();

  switch (normalizedProvider) {
    case 'vonage':
      // ─── Vonage Built-in Transcription ───────────────────────────────────
      // Uses standard parameters: language.
      return {
        language,
        eventUrl: [eventUrl],
        eventMethod: 'POST',
      };

    // ─── Coming in a future release ─────────────────────────────────────────
    // The Conversations API REST endpoint (PUT /v1/conversations/{uuid}/record)
    // does not yet support third-party transcription providers. These will be
    // enabled once the NCCO-based recording path or REST API support is added.
    //
    // case 'deepgram':
    //   // ─── ALPHA: Deepgram Post-Call Transcription ─────────────────────────
    //   return {
    //     eventUrl: [eventUrl],
    //     eventMethod: 'POST',
    //     provider: 'deepgram',
    //     providerOptions: {
    //       model: 'nova-3',
    //       language,
    //       diarize: true,
    //       diarize_model: 'latest',
    //       punctuate: true,
    //       smart_format: true,
    //       utterances: true,
    //     },
    //   };
    //
    // case 'aws':
    //   // ─── ALPHA: AWS Transcribe Post-Call Transcription ───────────────────
    //   return {
    //     eventUrl: [eventUrl],
    //     eventMethod: 'POST',
    //     provider: 'aws',
    //     providerOptions: {
    //       LanguageCode: language,
    //       Settings: {
    //         ChannelIdentification: true,
    //       },
    //     },
    //   };

    case 'none':
      return null;

    default:
      throw new Error(
        `Unknown transcription provider: "${provider}". Must be one of: vonage, none`
      );
  }
}

/**
 * Build the transcription configuration object for the Conversations API
 * REST endpoint. Uses snake_case field names (`event_url`, `event_method`,
 * `provider_options`) as required by the REST API.
 *
 * @param {string} provider - One of: "vonage", "none". ("deepgram", "deepgram-medical", "aws" planned for future release.)
 * @param {string} eventUrl - Webhook URL to receive transcription completion events.
 * @param {string} [language="fr-FR"] - BCP-47 language code for the transcription.
 * @returns {object|null} A transcription config object with snake_case keys, or null if provider is "none".
 *
 * @example
 * // Vonage built-in (REST)
 * buildTranscriptionConfigRest('vonage', 'https://example.com/tx', 'fr-FR')
 * // => { language: 'fr-FR', event_url: ['https://...'], event_method: 'POST' }
 *
 * @example
 * // Deepgram (REST)
 * buildTranscriptionConfigRest('deepgram', 'https://example.com/tx', 'fr-FR')
 * // => { event_url: ['https://...'], event_method: 'POST',
 * //      provider: 'deepgram', provider_options: { model: 'nova-3', ... } }
 */
function buildTranscriptionConfigRest(provider, eventUrl, language = 'fr-FR') {
  const normalizedProvider = (provider || 'none').toLowerCase();

  switch (normalizedProvider) {
    case 'vonage':
      return {
        language,
        event_url: [eventUrl],
        event_method: 'POST',
      };

    // ─── Coming in a future release ─────────────────────────────────────────
    // The Conversations API REST endpoint (PUT /v1/conversations/{uuid}/record)
    // does not yet support third-party transcription providers. These will be
    // enabled once the NCCO-based recording path or REST API support is added.
    //
    // case 'deepgram':
    //   return {
    //     event_url: [eventUrl],
    //     event_method: 'POST',
    //     provider: 'deepgram',
    //     provider_options: {
    //       model: 'nova-3',
    //       language,
    //       diarize: true,
    //       punctuate: true,
    //       smart_format: true,
    //     },
    //   };
    //
    // case 'deepgram-medical':
    //   return {
    //     event_url: [eventUrl],
    //     event_method: 'POST',
    //     provider: 'deepgram',
    //     provider_options: {
    //       model: 'nova-3-medical',
    //       language,
    //       diarize: true,
    //       punctuate: true,
    //       smart_format: true,
    //     },
    //   };
    //
    // case 'aws':
    //   return {
    //     event_url: [eventUrl],
    //     event_method: 'POST',
    //     provider: 'aws',
    //     provider_options: {
    //       LanguageCode: language,
    //       Settings: {
    //         ChannelIdentification: true,
    //       },
    //     },
    //   };

    case 'none':
      return null;

    default:
      throw new Error(
        `Unknown transcription provider: "${provider}". Must be one of: vonage, none`
      );
  }
}

/**
 * Build the transcription configuration object for the NCCO `record` action.
 * Uses camelCase field names (`eventUrl`, `eventMethod`, `providerOptions`)
 * as required by the NCCO record action's `transcription` field.
 *
 * All 5 providers are supported because the NCCO `record` action supports
 * third-party transcription providers (unlike the REST endpoint).
 *
 * @param {string} provider - One of: "vonage", "deepgram", "deepgram-medical", "aws", "none"
 * @param {string} eventUrl - Webhook URL to receive transcription completion events.
 * @param {string} [language="fr-FR"] - BCP-47 language code for the transcription.
 * @returns {object|null} A transcription config object with camelCase keys, or null if provider is "none".
 *
 * @example
 * // Vonage built-in (NCCO)
 * buildTranscriptionConfigNcco('vonage', 'https://example.com/tx', 'fr-FR')
 * // => { language: 'fr-FR', eventUrl: ['https://...'], eventMethod: 'POST' }
 *
 * @example
 * // Deepgram (NCCO)
 * buildTranscriptionConfigNcco('deepgram', 'https://example.com/tx', 'fr-FR')
 * // => { eventUrl: ['https://...'], eventMethod: 'POST',
 * //      provider: 'deepgram', providerOptions: { model: 'nova-3', language: 'fr', ... } }
 *
 * @example
 * // Deepgram Medical (NCCO)
 * buildTranscriptionConfigNcco('deepgram-medical', 'https://example.com/tx', 'fr-FR')
 * // => { eventUrl: ['https://...'], eventMethod: 'POST',
 * //      provider: 'deepgram', providerOptions: { model: 'nova-3-medical', language: 'fr', ... } }
 *
 * @example
 * // AWS Transcribe (NCCO)
 * buildTranscriptionConfigNcco('aws', 'https://example.com/tx', 'fr-FR')
 * // => { eventUrl: ['https://...'], eventMethod: 'POST',
 * //      provider: 'aws', providerOptions: { LanguageCode: 'fr-FR', Settings: { ... } } }
 */
function buildTranscriptionConfigNcco(provider, eventUrl, language = 'fr-FR') {
  const normalizedProvider = (provider || 'none').toLowerCase();

  switch (normalizedProvider) {
    case 'vonage':
      // ─── Vonage Built-in Transcription ───────────────────────────────────
      return {
        language,
        eventUrl: [eventUrl],
        eventMethod: 'POST',
      };

    case 'deepgram':
    case 'deepgram-medical': {
      // ─── Deepgram Standard / Medical ────────────────────────────────────
      // Deepgram expects the primary language subtag only (e.g., "fr"),
      // not the full BCP-47 tag (e.g., "fr-FR").
      const deepgramLanguage = language.split('-')[0];
      const model = normalizedProvider === 'deepgram-medical'
        ? 'nova-3-medical'
        : 'nova-3';
      return {
        eventUrl: [eventUrl],
        eventMethod: 'POST',
        provider: 'deepgram',
        providerOptions: {
          model,
          language: deepgramLanguage,
//          language: language,
          diarize: true,
          punctuate: true,
          smart_format: true,
        },
      };
    }

    case 'aws':
      // ─── AWS Transcribe ─────────────────────────────────────────────────
      return {
        eventUrl: [eventUrl],
        eventMethod: 'POST',
        provider: 'aws',
        providerOptions: {
          LanguageCode: language,
          Settings: {
            ChannelIdentification: true,
          },
        },
      };

    case 'none':
      return null;

    default:
      throw new Error(
        `Unknown transcription provider: "${provider}". Must be one of: vonage, deepgram, deepgram-medical, aws, none`
      );
  }
}

module.exports = { buildTranscriptionConfig, buildTranscriptionConfigRest, buildTranscriptionConfigNcco };
