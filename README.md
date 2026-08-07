# Vonage Proxy Recording

A Node.js/Express application that orchestrates two-party phone calls between healthcare professionals (HCPs) and patients via the Vonage Voice API. The system handles consent collection, optional call recording, and recording downloads — all through a proxy architecture that keeps both parties' real numbers private.

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

1. **Operator starts a call** via CLI prompt — enters HCP and patient phone numbers
2. **Leg 1 (HCP)** — Server calls the HCP via Vonage REST API (`POST /v1/calls`) with an inline NCCO
3. **HCP answers** — hears a hold message while the patient is dialed
4. **Leg 2 (Patient)** — Vonage dials the patient as part of the NCCO `connect` action
5. **Patient answers** — Vonage fetches `/ncco/patient` webhook for the consent prompt
6. **Consent prompt** — Patient hears a TTS message requesting recording consent and presses 1 (accept) or 2 (refuse)
7. **If consent granted** — Server triggers recording via the Vonage Conversations Recording API (`PUT /v1/conversations/{uuid}/record`)
8. **Parties bridged** — HCP and patient are connected
9. **Call ends** — Recording file is downloaded and saved locally

### Key Design Decisions

- **API-driven recording**: Recording is started via the Conversations API (not an NCCO `record` action) so it targets the HCP leg's conversation, capturing both sides in stereo
- **Fire-and-forget**: The consent response is sent immediately; recording start is async and non-blocking
- **No SDK dependency**: Uses raw `https.request` calls with JWT auth for full control

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
   ```

   `DEFAULT_HCP_NUMBER` and `DEFAULT_PATIENT_NUMBER` are optional — they pre-fill the CLI prompt so you can press Enter to reuse the same numbers between calls.

   To base64-encode your private key:
   ```bash
   base64 -i private.key | tr -d '\n'
   ```

5. Start ngrok (or similar):
   ```bash
   ngrok http 3000
   ```

6. Update `BASE_URL` in `.env` with your ngrok URL.

7. Configure your Vonage application's Answer URL and Event URL to point to your ngrok URL.

## Running

```bash
npm start
```

The server will start and prompt you for HCP and patient phone numbers (E.164 format, e.g., `+33612345678`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/ncco/patient` | Returns consent NCCO when patient answers |
| POST | `/consent` | Handles patient DTMF response (consent decision) |
| POST | `/recordings` | Receives recording metadata, triggers download |
| POST | `/events` | General call status events |
| POST | `/events/connect` | Patient-leg connection events |
| STATIC | `/audio/*` | Serves hold music and audio assets |

## Testing

```bash
npm test
```

Runs the full Jest test suite including property-based tests (fast-check).

## Project Structure

```
├── src/
│   ├── index.js              # Express app, CLI prompt, call initiation
│   ├── config.js             # Environment variable loading
│   ├── routes/
│   │   ├── ncco.js           # Patient consent NCCO webhook
│   │   ├── consent.js        # DTMF handler, triggers recording
│   │   ├── recordings.js     # Recording download handler
│   │   └── events.js         # Call status event logging
│   └── services/
│       ├── vonage.js         # Vonage API client (createCall, startRecording)
│       └── callState.js      # In-memory call state (HCP conversation UUID)
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
