# Call Flow Diagram

```mermaid
sequenceDiagram
    participant Operator as Operator (CLI)
    participant Server as Node.js/Express
    participant Vonage as Vonage Voice API
    participant HCP as HCP Phone
    participant Patient as Patient Phone

    Note over Operator,Server: Startup & Configuration
    Server->>Server: Load env, start Express on PORT
    Server->>Operator: Prompt "Enter HCP number"
    Operator->>Server: +33612345678
    Server->>Operator: Prompt "Enter Patient number"
    Operator->>Server: +33698765432
    Server->>Operator: Prompt "TTS voice tier"
    Operator->>Server: 3 (Premier/Chirp3 HD)
    Server->>Operator: Prompt "Transcription provider"
    Note over Operator,Server: 5 options: None, Vonage,<br/>Deepgram Standard, Deepgram Medical, AWS
    Operator->>Server: 3 (Deepgram Standard)
    Server->>Operator: Prompt "AMD + Call Screener?"
    Operator->>Server: N (default is OFF)

    Note over Server,Vonage: Call Initiation (inline NCCO: [record, talk, connect])
    Server->>Server: storeCallOptions(premier, deepgram, amd=false)
    Server->>Vonage: POST /v1/calls (JWT auth)<br/>NCCO: [record, talk (Premier), connect]<br/>to: HCP, from: LVN_A
    Vonage-->>Server: {uuid, conversation_uuid}
    Server->>Server: storeHcpConversationUuid(uuid, conversation_uuid)
    Vonage->>HCP: Ring (caller ID: LVN_A)

    Note over HCP,Vonage: HCP Answers
    HCP->>Vonage: Answer
    Vonage->>Vonage: record starts (async, stereo, split:conversation)
    Vonage->>HCP: TTS "Veuillez patienter..." (Premier Chirp3 HD)
    Vonage->>Patient: Ring (caller ID: LVN_B)
    Vonage->>HCP: Hold music (ringbackTone)

    opt AMD + Call Screener (only if enabled, default OFF)
        Note over Patient,Server: Screener intercepts call
        Vonage->>Server: POST /events/amd {sub_state: "screener"}
        Server->>Vonage: 200 + NCCO [talk "Bonjour, ceci est un appel important..."]
        Vonage->>Patient: TTS plays to Siri/screener (Standard FR voice)
        Vonage->>Server: POST /events/amd {sub_state: "human_answered"}
        Server->>Vonage: 204 (continue)
    end

    Note over Patient,Server: Patient Answers - Immediate Bridge
    Patient->>Vonage: Answer
    Vonage->>Server: GET /ncco/patient
    Server->>Vonage: [] (empty NCCO — immediate bridge)
    Vonage->>Vonage: Patient bridged into HCP conversation

    Note over HCP,Patient: Call in progress (recording active, stereo)
    HCP->>Patient: Connected conversation

    Note over HCP,Patient: Call Ends
    HCP->>Vonage: Hang up
    Vonage->>Server: POST /events {status: "completed"}

    Note over Vonage,Server: Recording Webhook
    Vonage->>Server: POST /recordings {recording_url, conversation_uuid}
    Server->>Server: Generate JWT
    Server->>Vonage: GET recording_url (JWT auth)
    Vonage->>Server: MP3 file data
    Server->>Server: Save to recordings/timestamp_uuid.mp3

    opt Transcription configured (Vonage, Deepgram Standard, Deepgram Medical, or AWS)
        Note over Vonage,Server: Vonage routes recording to selected provider
        Vonage->>Server: POST /transcriptions<br/>{status: "transcribed", transcription_url}
        Server->>Server: Generate JWT
        Server->>Vonage: GET transcription_url (JWT auth)
        Server->>Server: Save transcription JSON
    end
```

## Key Design Points

- **No consent workflow**: Recording starts unconditionally via the NCCO `record` action — no DTMF, no patient prompts.
- **HCP inline NCCO**: `[record, talk, connect]` — record runs asynchronously and immediately advances to the next action.
- **Patient NCCO**: `[]` (empty array) — patient is bridged immediately with no interaction.
- **AMD default is OFF**: Operator must opt-in to AMD + Call Screener.
- **All 5 transcription providers available**: None, Vonage, Deepgram Standard, Deepgram Medical, AWS — supported natively by the NCCO `record` action.
- **Two-LVN proxy**: HCP sees LVN_A, Patient sees LVN_B — real numbers are never exposed.
