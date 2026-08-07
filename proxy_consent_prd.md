# PRD — Proxy Call with Conditional Recording & Patient Consent
**Product:** Vonage Voice API — Healthcare Proxy Use Case
**Author:** —
**Version:** 1.0
**Date:** 2026-08-06

---

## 1. Overview

This document describes the technical design for a HIPAA/RGPD-compliant voice proxy solution enabling a healthcare professional (HCP) to call a patient via a masked number, with conditional call recording based on explicit patient consent.

The solution uses the Vonage Voice API with inline NCCOs (Nexmo Call Control Objects), requiring no answer_url webhook for the initial call creation. The only hosted endpoints required are the `onAnswer` webhook and the `/consent` handler.

This project will be hosted locally using ngrok.
Make a node.js express module

---

## 2. Business Requirements

| # | Requirement |
|---|---|
| BR-1 | The HCP's phone rings first. The patient is only dialled once the HCP has answered. |
| BR-2 | The patient answers before being connected to the HCP. |
| BR-3 | The patient is asked for explicit consent to be recorded before being bridged. |
| BR-4 | If the patient consents, the call is recorded in stereo (split channel). |
| BR-5 | If the patient refuses or does not respond, the call proceeds without recording. |
| BR-6 | The HCP and patient are connected after the consent step, regardless of outcome. |
| BR-7 | Both parties' real phone numbers are masked by Vonage Long Virtual Numbers (LVNs). |

---

## 3. Architecture

### 3.1 Call Flow Summary

```
[Your Application]
       │
       └── POST /v1/calls  (NCCO 1 — inline)
                │
                └── HCP phone rings
                          │
                          └── HCP answers
                                    │
                                    └── connect → Patient phone rings
                                                        │
                                                        └── Patient answers
                                                                  │
                                                                  └── onAnswer → NCCO 2 (hosted)
                                                                                    │
                                                                              Consent prompt + DTMF
                                                                                    │
                                                                          ┌─────────┴─────────┐
                                                                        Press 1           Press 2 / Timeout
                                                                      (Consent)            (Refuses)
                                                                          │                    │
                                                                    /consent             /consent
                                                                    returns              returns
                                                                    [record]               []
                                                                          │                    │
                                                                   HCP ↔ Patient bridged (with or without recording)
```

### 3.2 Webhooks Required

| Endpoint | Method | Purpose |
|---|---|---|
| `onAnswer`: `/ncco/patient` | GET/POST | Serves NCCO 2 — consent prompt for patient |
| `/consent` | POST | Receives DTMF digit, returns conditional `record` NCCO |
| `/recordings` | POST | Receives completed recording metadata and URL |
| `/events` | POST | Receives call status events (answered, completed, failed, etc.) |
| `/events/connect` | POST | Receives connect-leg specific events |

---

## 4. NCCO Design

### 4.1 NCCO 1 — Inline on `POST /v1/calls` (HCP leg)

Delivered directly in the API request body — no `answer_url` required.

**HCP experience:** Hears a TTS hold message, then hold music loops while the patient's phone rings and the consent prompt plays on the patient's leg. Music stops the moment both parties are bridged.

```json
POST https://api.nexmo.com/v1/calls
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "to": [{ "type": "phone", "number": "<HCP_PHONE_NUMBER>" }],
  "from": { "type": "phone", "number": "<LVN_A>" },
  "event_url": ["https://your-app.example.com/events"],
  "ncco": [
    {
      "action": "talk",
      "text": "Veuillez patienter, nous allons contacter le patient."
    },
    {
      "action": "connect",
      "from": "<LVN_B>",
      "endpoint": [{ "type": "phone", "number": "<PATIENT_PHONE_NUMBER>" }],
      "onAnswer": {
        "url": "https://your-app.example.com/ncco/patient",
        "ringbackTone": "https://your-app.example.com/audio/hold-music.mp3"
      },
      "eventUrl": ["https://your-app.example.com/events/connect"]
    }
  ]
}
```

**Notes:**
* `from` on the `connect` action controls the CLI (caller ID) that the patient sees — set this to the hospital or clinic's number.
* `ringbackTone` plays to the HCP while the patient hears the consent prompt. It stops automatically once the patient is bridged. Note: carrier ringback may override this depending on the network — test with target operators.
* No `record` action here — recording is conditional and handled downstream.

---

### 4.2 NCCO 2 — Served at `/ncco/patient` (Patient leg, before bridging)

This NCCO executes **only on the patient's leg** and **before they are joined** to the HCP's conversation. The HCP cannot hear this prompt.

```json
[
  {
    "action": "talk",
    "text": "Bonjour. Votre médecin souhaite vous contacter. Cet appel peut être enregistré à des fins médicales. Appuyez sur 1 pour accepter l'enregistrement, ou sur 2 pour refuser.",
    "bargeIn": true
  },
  {
    "action": "input",
    "type": ["dtmf"],
    "dtmf": {
      "maxDigits": 1,
      "timeOut": 10
    },
    "eventUrl": ["https://your-app.example.com/consent"]
  }
]
```

**Notes:**
* `bargeIn: true` allows the patient to press a digit immediately without waiting for TTS to finish.
* `timeOut: 10` gives the patient 10 seconds after TTS ends to respond. Adjust as needed.
* The `eventUrl` receives a POST with the digit pressed, which drives the consent decision.

---

### 4.3 NCCO 3 — Returned by `/consent` (Conditional recording)

The `/consent` webhook receives the DTMF input event from the `input` action and returns the appropriate NCCO continuation.

#### Patient presses 1 — Consents to recording

The `record` action is **asynchronous**: it starts immediately, then the NCCO exits, and the patient is bridged into the HCP's conversation. Recording captures both legs in stereo from this point forward.

```json
[
  {
    "action": "talk",
    "text": "Merci. Vous allez être mis en relation avec votre médecin."
  },
  {
    "action": "record",
    "split": "conversation",
    "channels": 2,
    "eventUrl": ["https://your-app.example.com/recordings"]
  }
]
```

#### Patient presses 2, or input times out — Refuses or no response

No `record` action is triggered. The NCCO exits immediately and the patient is bridged without recording.

```json
[
  {
    "action": "talk",
    "text": "Entendu. Cet appel ne sera pas enregistré. Vous allez être mis en relation avec votre médecin."
  }
]
```

**Notes:**
* `split: "conversation"` with `channels: 2` produces a stereo MP3 where Channel 1 = HCP and Channel 2 = patient. This requires both legs to be in the same connect-based conversation, which is the case here.
* The recording file URL is delivered to `/recordings` once the call ends.
* On timeout, the `input` action fires the `eventUrl` with a `timed_out` status — your `/consent` handler should treat this identically to press 2.

---

## 5. Consent Event Handling

Your `/consent` endpoint will receive a POST body from the Voice API `input` event. Key fields to handle:

| Field | Value | Action |
|---|---|---|
| `dtmf.digits` | `"1"` | Return `[record]` NCCO — start stereo recording |
| `dtmf.digits` | `"2"` | Return `[]` or farewell NCCO — no recording |
| `dtmf.timed_out` | `true` | Return `[]` or farewell NCCO — no recording |
| Any other digit | — | Treat as refusal — return `[]` |

---

## 6. Recording Delivery

When `record` is used and the call ends, Vonage sends a POST to your `/recordings` webhook containing:

```json
{
  "start_time": "2026-08-06T10:00:00Z",
  "recording_url": "https://api.nexmo.com/v1/files/<recording-uuid>",
  "size": 12345,
  "recording_uuid": "<uuid>",
  "end_time": "2026-08-06T10:10:00Z",
  "conversation_uuid": "<conversation-uuid>",
  "status": "ok"
}
```

Download the file using a JWT-authenticated GET request to `recording_url`. Store securely in compliance with applicable health data regulations (RGPD / HDS).

---

## 7. Error & Edge Cases

| Scenario | Behaviour |
|---|---|
| HCP does not answer | Vonage fires `unanswered` event to `/events`. Patient is never dialled. |
| Patient does not answer | Vonage fires `unanswered` event to `/events/connect`. HCP hears the hold music until timeout, then the connect action completes. Consider playing a TTS to HCP after `connect`. |
| Patient hangs up during consent prompt | The `onAnswer` NCCO is interrupted. Vonage fires a `completed` event. HCP should be notified and released. |
| `/ncco/patient` is unreachable | The `connect` action fails — Vonage fires an error event to `/events/connect`. HCP leg should be released gracefully. |
| `/consent` is unreachable | Same as patient press 2 from Vonage's perspective — the `input` action will timeout. Treat as refusal. |

---

## 8. Infrastructure Requirements

| Component | Requirement |
|---|---|
| LVN A | One Vonage LVN to present as caller ID to HCP |
| LVN B | One Vonage LVN to present as caller ID to patient (hospital/clinic number) |
| Webhook server | HTTPS endpoint serving `/ncco/patient`, `/consent`, `/recordings`, `/events` |
| Audio file | MP3 hold music hosted at a publicly accessible HTTPS URL (for `ringbackTone`) |
| JWT generation | Server-side JWT signed with Vonage Application private key for API authentication |

---

## 9. Open Questions

| # | Question | Owner |
|---|---|---|
| OQ-1 | What hold music / ringback tone file should be used? | Customer |
| OQ-2 | What is the exact consent wording approved by legal/compliance? | Customer |
| OQ-3 | What timeout value (seconds) is acceptable for patient DTMF input? | Customer |
| OQ-4 | Where are recordings stored, and what is the retention policy? | Customer |
| OQ-5 | Should a no-answer by the patient trigger a retry or notify the HCP via another channel? | Customer |
