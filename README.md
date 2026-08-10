# Vonage Voice Proxy with Recording

A Node.js/Express reference application demonstrating two-party phone calls between healthcare professionals (HCPs) and patients via the Vonage Voice API. The system uses unconditional stereo recording via the NCCO `record` action, optional post-call transcription (5 providers), and a two-LVN proxy architecture that keeps both parties' real numbers private.

## Features

- **Unconditional recording via NCCO record action** — Recording starts automatically as part of the HCP's inline NCCO. No consent prompt, no DTMF interaction needed.
- **TTS voice tier selection** — Standard, Premium, or Premier (Google Chirp3 HD) voices
- **Post-call transcription** — 5 providers available: None, Vonage, Deepgram Standard, Deepgram Medical, AWS Transcribe
- **Advanced Machine Detection + Call Screener** — Detects voicemail and handles iOS 18+ Siri call screening (default: OFF)

### Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Premium + Premier TTS (Chirp3 HD) | Available | Google HD voices |
| Post-call transcription (Vonage) | Available | Built-in Vonage transcription engine |
| Post-call transcription (Deepgram Standard) | Available | nova-3 model |
| Post-call transcription (Deepgram Medical) | Available | nova-3-medical model |
| Post-call transcription (AWS Transcribe) | Available | AWS transcription with channel identification |
| AMD + Call Screener | Available | Default OFF; can be enabled per call |

## Architecture

```
┌──────────┐       ┌─────────────────┐       ┌──────────────────┐
│ Operator │──────▶│ Express Server  │◀─────▶│ Vonage Voice API │
│   (CLI)  │       │ (this app)      │       │                  │
└──────────┘       └─────────────────┘       └──────────────────┘
                          │                         │
                          │ calls                   │ calls
                          ▼                         ▼
                   ┌─────────────┐          ┌─────────────┐
                   │  HCP Phone  │          │Patient Phone│
                   └─────────────┘          └─────────────┘
```

## Call Flow

1. **Operator starts a call** via CLI — enters phone numbers, selects TTS tier, transcription provider, and AMD toggle
2. **Leg 1 (HCP)** — Server calls the HCP via `POST /v1/calls` with an inline NCCO: `[record, talk, connect]`
3. **HCP answers** — recording starts unconditionally (stereo, both legs); HCP hears a hold message while the patient is dialed
4. **Leg 2 (Patient)** — Vonage dials the patient via the NCCO `connect` action with `onAnswer` (with optional AMD + Call Screener)
5. **Call Screener** (if enabled) — If Siri/screener answers, the app plays a French pass-through message
6. **Patient answers** — Vonage fetches `/ncco/patient` which returns an empty array `[]` — patient is immediately bridged into the conversation
7. **Both parties connected** — Recording continues for the full conversation duration
8. **Call ends** — Recording file is delivered to `/recordings`; transcription result (if configured) to `/transcriptions`

### Key Design Decisions

- **NCCO record action**: Uses the NCCO `record` action (with `split: "conversation"`, `channels: 2`) in the HCP's inline NCCO. Recording starts immediately when the HCP answers — no consent step needed.
- **No consent workflow**: The patient NCCO returns an empty array, so the patient is bridged immediately with no prompts or DTMF interaction.
- **All 5 transcription providers**: The NCCO `record` action supports Vonage, Deepgram, and AWS transcription natively.
- **No named conversation / transfer**: Both legs stay in the original connect-based conversation. No `transferCall` needed.
- **No SDK dependency**: Uses raw `https.request` calls with JWT auth for full control and transparency.

## Prerequisites

- Node.js 18+
- A [Vonage](https://developer.vonage.com) account with:
  - A Voice-enabled application (with public/private key pair)
  - Two virtual numbers (LVNs) — one for each call leg
- A publicly accessible URL (e.g., [ngrok](https://ngrok.com)) for webhooks

## Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd vonage-proxy-consent-recording
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Fill in your `.env` values (see `.env.example` for all options)

   To base64-encode your private key:
   ```bash
   base64 -i private.key | tr -d '\n'
   ```

5. Start ngrok:
   ```bash
   ngrok http 3000
   ```

6. Update `BASE_URL` in `.env` with your ngrok URL.

## Running

```bash
npm start
```

The server starts and prompts you for configuration:

```
Enter HCP phone number (E.164):
Enter Patient phone number (E.164):

TTS Voice Tier:
  1) Standard (default)
  2) Premium
  3) Premier (Google Chirp3 HD) — NEW
Select TTS voice [1]:

Post-Call Transcription Provider:
  1) None (default)
  2) Vonage (built-in)
  3) Deepgram Standard (nova-3)
  4) Deepgram Medical (nova-3-medical)
  5) AWS Transcribe
Select transcription provider [1]:

Enable AMD + Call Screener? [y/N]:
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/ncco/patient` | Returns empty NCCO `[]` for immediate bridge |
| POST | `/recordings` | Receives recording metadata, triggers download |
| POST | `/transcriptions` | Receives transcription completion webhooks |
| POST | `/events` | General call status events |
| POST | `/events/connect` | Patient-leg connection events |
| POST | `/events/amd` | AMD + Call Screener events |
| STATIC | `/audio/*` | Serves hold music and audio assets |

## Testing

```bash
npm test
```

Runs the full Jest test suite including property-based tests (fast-check).

## Project Structure

```
├── src/
│   ├── index.js              # Express app, CLI prompts, call initiation, HCP NCCO builder
│   ├── config.js             # Environment variable loading
│   ├── routes/
│   │   ├── ncco.js           # Patient NCCO webhook (returns [])
│   │   ├── recordings.js     # Recording download handler
│   │   ├── transcriptions.js # Transcription webhook handler
│   │   ├── events.js         # Call status event logging
│   │   └── amd.js            # AMD + Call Screener event handler
│   └── services/
│       ├── vonage.js         # Vonage API client (createCall, generateJwt)
│       ├── callState.js      # In-memory call state + per-call options
│       ├── tts.js            # TTS helper (Standard/Premium/Premier)
│       ├── transcription.js  # Transcription config builder (NCCO format)
│       └── amd.js            # AMD config builder
├── public/
│   └── audio/                # Static audio files (hold music)
├── recordings/               # Downloaded recordings (gitignored)
├── .env.example              # Template for environment variables
├── call-flow.md              # Mermaid sequence diagram of full call flow
└── package.json
```

## Security Notes

- Never commit `.env` or private key files — they are gitignored
- The `VONAGE_PRIVATE_KEY64` env var contains your base64-encoded RSA private key
- Recordings are stored locally in `recordings/` (also gitignored)
- All Vonage API calls use short-lived JWTs (15-minute expiry)

## License

ISC
