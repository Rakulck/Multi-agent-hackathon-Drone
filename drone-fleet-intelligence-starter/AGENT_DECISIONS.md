# Agent Decision Boundaries

## Deterministic code owns

- Payload comparisons.
- Range and battery reserve checks.
- Wind-threshold checks.
- Drone availability.
- Active-memory expiry checks.
- Route-blocked enforcement.
- API-timeout behavior.
- Mission pause and human-approval gates.

## Gemini may assist with

- Turning a natural-language request into structured fields.
- Classifying a simulated obstacle image.
- Ranking already-safe eligible options.
- Producing a concise operator explanation.
- Returning schema-constrained structured output.

## Gemini must not

- Directly control a physical drone.
- override a failed guardrail;
- invent coordinates or telemetry;
- decide that stale or missing safety data is acceptable;
- silently continue after malformed output.

## Expected decision record

- Order ID.
- Status.
- Selected drone or `null`.
- Selected route or `null`.
- Rejected drones with reasons.
- Rejected routes with reasons.
- Memory record IDs used.
- Whether human approval is required.
- One-sentence reasoning brief.

## Validation

All model output must be schema-validated. Invalid output triggers a deterministic fallback or a paused mission, not a guessed repair that launches the flight.

