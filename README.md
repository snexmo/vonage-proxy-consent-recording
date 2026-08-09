# Vonage Voice Proxy with Consent Recording

A Node.js/Express reference application demonstrating two-party phone calls between healthcare professionals (HCPs) and patients via the Vonage Voice API. The system handles consent collection, conditional call recording with post-call transcription, and recording downloads — all through a proxy architecture that keeps both parties' real numbers private.

## Features

- **Conditional recording via REST API** — Recording starts only after explicit patient consent, using `PUT /v1/conversations/{uuid}/record`
- **TTS voice tier selection** — Standard, Premium, or Premier (Google Chirp3 HD) voices
- **Post-call transcription** — Vonage built-in transcription (Deepgram and AWS planned for future platform release)
- **Advanced Machine Detection + Call Screener** — Handles iOS 18+ Siri call screening with automated pass-through messaging

### Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Premier TTS (Chirp3 HD) | ✓ Available | Google Chirp3 HD voices |
| Post-call transcription (Vonage) | ✓ Available | Built-in Vonage transcription engine |
| Post-call transcription (Deepgram/AWS) | ✗ Pending | Requires platform support on Conversations API record endpoint |
| AMD + Call Screener | ✓ Available | Can be further enhanced (e.g. separate AMD/screener toggles, configurable beepTimeout) |

## Architecture

```
┌──────────┐       ┌─────────────────┐       ┌──────────────────┐
│ Operator │──────▶│ Express Server  │◀─────▶│ Vonage Voice API │
│   (CLI)  │       │ (this app)      │       │                  │
└──────────┘       └─────────────────┘       └──────────────────┘
                          │                         │
                          │ webhooks                │ calls
                          ▼                         ▼
                   ┌─────────────┐          ┌─────────────┐
                   │  HCP Phone  │          │Patient Phone│
                   └─────────────┘          └─────────────┘
```

## Call Flow

1. **Operator starts a call** via CLI — enters phone numbers, selects TTS tier, transcription provider, and AMD toggle
2. **Leg 1 (HCP)** — Server calls the HCP via `POST /v1/calls` with an inline NCCO (talk + connect)
3. **HCP answers** — hears a hold message while the patient is dialed
4. **Leg 2 (Patient)** — Vonage dials the patient via the NCCO `connect` action with `onAnswer` (with optional AMD + Call Screener)
5. **Call Screener** (if enabled) — If Siri/screener answers, the app plays a French pass-through message
6. **Patient answers** — Vonage fetches `/ncco/patient` for the consent prompt
7. **Consent prompt** — Patient hears a TTS message and presses 1 (accept) or 2 (refuse)
8. **If consent granted**:
   - Server starts recording via REST API: `PUT /v1/conversations/{conv_uuid}/record`
   - Returns talk-only NCCO to the patient ("Merci...")
   - Patient's NCCO ends → auto-bridges back into the HCP's connect-based conversation
   - Both parties are now connected with recording active (stereo, both legs)
9. **If consent refused** — Patient auto-bridges to HCP with no recording, no API calls
10. **Call ends** — Recording file is delivered to `/recordings`; transcription result (if configured) to `/transcriptions`

### Key Design Decisions

- **REST API recording**: Uses `PUT /v1/conversations/{uuid}/record` after consent rather than NCCO-based `record` action. This allows recording to start mid-call without transferring legs.
- **No named conversation / transfer**: Both legs stay in the original connect-based conversation. No `transferCall` needed.
- **No SDK dependency**: Uses raw `https.request` calls with JWT auth for full control and transparency.
- **Fire-and-forget**: The consent response is sent immediately; recording start is `await`-ed but failures don't block the call.

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
  3) ✗ Deepgram Standard (nova-2-phonecall) — future platform release
  4) ✗ Deepgram Medical (nova-3-medical) — future platform release
  5) ✗ AWS Transcribe — future platform release
Select transcription provider [1]:

Enable AMD + Call Screener? [Y/n]:
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/ncco/patient` | Returns consent NCCO when patient answers |
| POST | `/consent` | Handles patient DTMF response, starts recording if consented |
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
│   │   ├── ncco.js           # Patient consent NCCO webhook
│   │   ├── consent.js        # DTMF handler → starts recording via REST API
│   │   ├── recordings.js     # Recording download handler
│   │   ├── transcriptions.js # Transcription webhook handler
│   │   ├── events.js         # Call status event logging
│   │   └── amd.js            # AMD + Call Screener event handler
│   └── services/
│       ├── vonage.js         # Vonage API client (createCall, startRecording)
│       ├── callState.js      # In-memory call state + per-call options
│       ├── tts.js            # TTS helper (Standard/Premium/Premier)
│       ├── transcription.js  # Transcription config builder
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
