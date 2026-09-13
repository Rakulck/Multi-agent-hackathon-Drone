# Architecture

## Runtime layers

### Browser dashboard

- Renders the operations UI and Google Maps 3D scene.
- Sends user actions such as Run Mission 1 or Run Mission 2 to server routes.
- Receives sanitized mission state and notification results.
- Never receives Airtable, Slack, Twilio, Gemini, or OpenWeather secrets.

### Server application

- Validates delivery requests.
- Runs deterministic eligibility and safety rules.
- Reads and writes shared memory.
- Calls Gemini for bounded non-safety tasks.
- Sends Slack and Twilio messages.
- Normalizes weather data.

### External systems

- Airtable: persistence and visible proof of memory.
- Gemini: structured extraction/classification/explanation.
- Google Maps 3D: visualization.
- Slack: operator communication.
- Twilio: customer communication.
- OpenWeather: weather input.
- Lemma: optional tracing.

## Core event flow

1. Dashboard creates a mission request.
2. Server loads normalized fleet, weather, and active nearby memories.
3. Deterministic guardrails filter drones and routes.
4. Gemini optionally ranks safe candidates or explains the result.
5. Server validates the result and advances the state machine.
6. Dashboard renders the selected drone/route.
7. Simulated sensor event creates an obstacle-memory candidate.
8. Server validates and persists the memory.
9. Notifications are attempted and logged independently.
10. Later missions query and cite active memories before approval.

## Non-negotiable rules

- UI state is not the source of truth for safety decisions.
- LLM output is untrusted until schema-validated.
- Missing required preflight data means pause, not proceed.
- Twilio and Slack failures do not silently disappear.
- Every decision can identify its inputs, rejected alternatives, and memory IDs.

