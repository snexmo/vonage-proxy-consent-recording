'use strict';

/**
 * Transcription Configuration Builder
 *
 * Generates the `transcription` object for the NCCO `conversation` action
 * based on the selected provider. This object is passed inside the
 * `conversation` action alongside `record: true`.
 *
 * Supported providers:
 *   - "vonage" — Built-in Vonage transcription (language + sentimentAnalysis)
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
 * │   • The existing `transcription.language` and                           │
 * │     `transcription.sentimentAnalysis` parameters are IGNORED            │
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
 * @param {string} provider - One of: "vonage", "deepgram", "aws", "none".
 * @param {string} eventUrl - Webhook URL to receive transcription completion events.
 * @param {string} [language="fr-FR"] - BCP-47 language code for the transcription.
 * @returns {object|null} A transcription config object, or null if provider is "none".
 *
 * @example
 * // Vonage built-in
 * buildTranscriptionConfig('vonage', 'https://example.com/tx', 'fr-FR')
 * // => { language: 'fr-FR', eventUrl: ['https://...'], eventMethod: 'POST',
 * //      sentimentAnalysis: true }
 *
 * @example
 * // Deepgram (alpha)
 * buildTranscriptionConfig('deepgram', 'https://example.com/tx', 'fr-FR')
 * // => { eventUrl: ['https://...'], eventMethod: 'POST',
 * //      provider: 'deepgram', providerOptions: { model: 'nova-2-phonecall', ... } }
 */
function buildTranscriptionConfig(provider, eventUrl, language = 'fr-FR') {
  const normalizedProvider = (provider || 'none').toLowerCase();

  switch (normalizedProvider) {
    case 'vonage':
      // ─── Vonage Built-in Transcription ───────────────────────────────────
      // Uses standard parameters: language and sentimentAnalysis.
      // sentimentAnalysis is in Developer Preview — returns -1 to 1 per segment.
      return {
        language,
        eventUrl: [eventUrl],
        eventMethod: 'POST',
        sentimentAnalysis: true,
      };

    case 'deepgram':
      // ─── ALPHA: Deepgram Post-Call Transcription ─────────────────────────
      // When `provider` is set, the `language` and `sentimentAnalysis`
      // parameters on the transcription object are IGNORED by Vonage.
      // The raw Deepgram JSON response is served at transcription_url.
      //
      // Recommended model: "nova-2-phonecall" for telephony audio
      // Alternative: "nova-3" for latest generation
      return {
        eventUrl: [eventUrl],
        eventMethod: 'POST',
        provider: 'deepgram',
        providerOptions: {
          model: 'nova-2-phonecall',
          language,
          diarize: true,
          diarize_model: 'latest',
          punctuate: true,
          smart_format: true,
          utterances: true,
        },
      };

    case 'aws':
      // ─── ALPHA: AWS Transcribe Post-Call Transcription ───────────────────
      // When `provider` is set, the `language` and `sentimentAnalysis`
      // parameters on the transcription object are IGNORED by Vonage.
      // The raw AWS Transcribe JSON response is served at transcription_url.
      //
      // ChannelIdentification: true maps channels to agent/customer roles
      // when used with `split: "conversation"`.
      // Sentiment analysis (positive/negative/neutral/mixed) is always
      // returned by AWS — no extra flag needed.
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
        `Unknown transcription provider: "${provider}". Must be one of: vonage, deepgram, aws, none`
      );
  }
}

module.exports = { buildTranscriptionConfig };
