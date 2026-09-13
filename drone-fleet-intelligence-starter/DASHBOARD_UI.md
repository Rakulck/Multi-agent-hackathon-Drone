# Dashboard UI

## Design direction

A serious operations console: dark graphite background, crisp white type, restrained blue accents, amber warnings, red blocked states, and green approved states. Avoid a playful consumer-delivery appearance.

## Desktop layout

### Top bar

- Product name and tagline.
- Environment badge: `SIMULATION`.
- Connection indicators for Maps, Airtable, Slack, Twilio, Weather, and Gemini.
- Reset Demo button.

### KPI strip

- Active mission.
- Available drones.
- Active shared hazards.
- Estimated arrival time.

### Main workspace

- Left, approximately 70%: large 3D map and route legend.
- Right, approximately 30%: mission intelligence panel.

### Mission intelligence panel

- Incoming order summary.
- Deterministic guardrail results.
- Selected drone and reason.
- Selected route and reason.
- Memory records consulted.
- Current state and human-approval status.

### Lower section

- Mixed-vendor fleet comparison table.
- Live event timeline.
- Shared-memory record card.
- Mission 1, Mission 2, and Reset controls.

## UI states

- `READY`
- `EVALUATING`
- `APPROVED`
- `IN_FLIGHT`
- `HAZARD_DETECTED`
- `REROUTING`
- `DELIVERED`
- `PAUSED_WEATHER`
- `PAUSED_API_FAILURE`
- `HUMAN_APPROVAL_REQUIRED`

## Base scaffold boundary

Before the core hackathon build, the dashboard may contain placeholders, mock data, reusable components, and connection-status shells. The mission state machine, hazard-learning behavior, and judged integrations should be implemented during the event if required by its rules.

