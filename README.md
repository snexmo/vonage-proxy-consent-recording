# Vonage Proxy Recording

A Node.js/Express reference application that orchestrates two-party phone calls between healthcare professionals (HCPs) and patients via the Vonage Voice API. The system handles consent collection, conditional call recording with post-call transcription, and recording downloads — all through a proxy architecture that keeps both parties' real numbers private.

## Features

- **Conditional recording via named conversations** — Recording starts only after explicit patient consent, using a named NCCO `conversation` action with `record: true`
- **TTS voice tier selection** — Standard, Premium, or Premier (Google Chirp3 HD) voices
- **Post-call transcription** — Choose between Vonage built-in, Deepgram, or AWS Transcribe
- **Advanced Machine Detection + Call Screener** — Handles iOS 18+ Siri call screening with automated pass-through messaging

### Alpha / New Feature Status

| Feature | Status | Reference |
|---------|--------|-----------|
| Premier TTS (Chirp3 HD) | GA | [Google Chirp3 HD docs](https://cloud.google.com/text-to-speech/docs/chirp3-hd) |
| Post-call transcription (Deepgram/AWS) | Alpha (Q3 2026 PI) | APIVOICEF-755 |
| Call Screener Navigator | Dark-deployed | APIDOC-2304 |

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
2. **Leg 1 (HCP)** — Server calls the HCP via `POST /v1/calls` with an inline NCCO
3. **HCP answers** — hears a hold message (using selected TTS tier) while the patient is dialed
4. **Leg 2 (Patient)** — Vonage dials the patient via the NCCO `connect` action (with optional AMD + Call Screener)
5. **Call Screener** (if enabled) — If Siri/screener answers, the app plays a French pass-through message
6. **Patient answers** — Vonage fetches `/ncco/patient` for the consent prompt
7. **Consent prompt** — Patient hears a TTS message and presses 1 (accept) or 2 (refuse)
8. **If consent granted**:
   - Patient joins a new **named conversation** with `record: true` and `transcription` settings
   - HCP is transferred into the same named conversation via `PUT /v1/calls/{uuid}`
   - Both parties are bridged with recording + transcription active
9. **If consent refused** — Patient auto-bridges to HCP, no recording
10. **Call ends** — Recording file is delivered to `/recordings`; transcription result is delivered to `/transcriptions`

### Key Design Decisions

- **Named conversation for recording**: The patient's onAnswer NCCO runs in a temporary conversation that terminates on bridge. To capture both sides, we use a named conversation that both legs join after consent.
- **HCP transfer via REST**: Only the transfer action uses the REST API (`PUT /v1/calls/{uuid}`). Recording itself is configured via the NCCO `conversation` action — compatible with third-party transcription providers.
- **Fire-and-forget**: The consent response is sent immediately; the HCP transfer is async and non-blocking.
- **No SDK dependency**: Uses raw `https.request` calls with JWT auth for full control.

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
   cd vonage-proxy-recording
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Fill in your `.env` values:
   ```
   VONAGE_APPLICATION_ID=<your-app-uuid>
   VONAGE_PRIVATE_KEY64=<base64-encoded-private-key>
   VONAGE_API_KEY=<your-api-key>
   VONAGE_API_SECRET=<your-api-secret>
   LVN_A=<number-for-hcp-leg>
   LVN_B=<number-for-patient-leg>
   PORT=3000
   BASE_URL=<your-ngrok-https-url>
   DEFAULT_HCP_NUMBER=+33612345678
   DEFAULT_PATIENT_NUMBER=+33698765432
   TRANSCRIPTION_LANGUAGE=fr-FR
   ```

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
Enter HCP phone number (E.164) [+33612345678]:
Enter Patient phone number (E.164) [+33698765432]:

TTS Voice Tier:
  1) Standard (default)
  2) Premium
  3) Premier (Google Chirp3 HD) — NEW
Select TTS voice [1]:

Post-Call Transcription Provider:
  1) None (default)
  2) Vonage (built-in)
  3) Deepgram (nova-2-phonecall) — ALPHA
  4) AWS Transcribe — ALPHA
Select transcription provider [1]:

Enable AMD + Call Screener? [Y/n]:
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/ncco/patient` | Returns consent NCCO when patient answers |
| POST | `/consent` | Handles patient DTMF response, returns recorded conversation NCCO |
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
│   │   ├── consent.js        # DTMF handler, named conversation + HCP transfer
│   │   ├── recordings.js     # Recording download handler
│   │   ├── transcriptions.js # Transcription webhook handler
│   │   ├── events.js         # Call status event logging
│   │   └── amd.js            # AMD + Call Screener event handler
│   └── services/
│       ├── vonage.js         # Vonage API client (createCall, transferCall)
│       ├── callState.js      # In-memory call state + per-call options
│       ├── tts.js            # TTS helper (Standard/Premium/Premier)
│       ├── transcription.js  # Transcription config builder
│       └── amd.js            # AMD config builder
├── public/
│   └── audio/                # Static audio files (hold music)
├── recordings/               # Downloaded recordings (gitignored)
├── .env.example              # Template for environment variables
└── package.json
```

## Security Notes

- Never commit `.env` or private key files — they are gitignored
- The `VONAGE_PRIVATE_KEY64` env var contains your base64-encoded RSA private key
- Recordings are stored locally in `recordings/` (also gitignored)
- All Vonage API calls use short-lived JWTs (15-minute expiry)

## License

ISC
