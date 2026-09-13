# Reliability and Evaluation

## Reliability principle

Separate probabilistic reasoning from safety gates. If required live safety data is missing, pause the mission and request human review.

## Required fallback behavior

| Failure | Expected behavior |
|---|---|
| Weather unavailable | Pause before approval; show operator alert |
| Airtable unavailable before flight | Pause because hazard memory cannot be verified |
| Airtable write fails in flight | Continue only through the controlled simulation fallback; flag memory persistence failure and notify operator |
| Gemini unavailable or malformed | Use deterministic rules and a prewritten explanation; do not bypass safety checks |
| Slack unavailable | Keep mission state visible and log notification failure |
| Twilio unavailable | Do not affect flight safety; show customer-message failure and permit retry |
| Maps fails | Preserve decisions in the dashboard; show a non-map route summary |

## Evaluation cases

1. Normal delivery: eligible drone and clear route.
2. Payload rejection: 4.5 kg package rejects 2 kg drone.
3. Availability change: Atlas charging causes CargoSwift selection.
4. Learned hazard: Route A is allowed before Mission 1 and rejected before Mission 2.
5. Expired hazard: an expired record no longer blocks a route.
6. High wind: all unsafe drones are rejected or the mission pauses.
7. Missing memory service: mission pauses before flight.
8. Invalid Gemini output: schema validation catches it and deterministic fallback runs.

## Metrics to display

- Eligible drones versus total drones.
- Candidate routes versus rejected routes.
- Memories retrieved and memories applied.
- Decision latency.
- API success/failure status.
- Estimated distance or time saved versus rediscovering the hazard.

## Demo reset

Reset must clear local simulation state and restore demo records predictably. Keep an emergency prerecorded video as a presentation fallback.

