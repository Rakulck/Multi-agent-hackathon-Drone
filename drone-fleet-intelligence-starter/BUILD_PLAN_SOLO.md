# Solo Build Plan

## Before the hackathon

Only do work permitted by the event rules. Safe preparation usually includes accounts, API keys, environment verification, reading documentation, visual planning, and reusable non-solution-specific scaffolding. Confirm the organizer's exact pre-build policy.

- Verify Node.js, npm, Git, and Cursor.
- Verify every API credential independently.
- Prepare `.env.local` without committing it.
- Create the reusable dashboard shell if allowed.
- Confirm Google Maps 3D renders a minimal sample if allowed.
- Prepare the fixed demo story and waypoint data separately.
- Prepare a screen-recording setup and backup browser profile.

## Hackathon sequence

1. Implement deterministic domain types and guardrails.
2. Implement controlled mission state machine.
3. Render fixed Route A/B/C and drone animation.
4. Implement local memory loop end-to-end.
5. Replace local memory with Airtable persistence.
6. Connect Slack and Twilio notifications.
7. Connect weather.
8. Add Gemini only after the deterministic loop works.
9. Add failure toggles and reliability evidence.
10. Polish, rehearse, record, and stop adding features.

## Cut order if time slips

1. Lemma/tracing integration.
2. Real image analysis; use a clearly labeled simulated sensor event.
3. Fancy drone model; use a marker.
4. Camera-follow polish.
5. Additional industries and additional obstacles.

Do not cut the Mission 1 memory write, Mission 2 memory retrieval, mixed-vendor drone switch, deterministic safety rules, or visible real-app integrations.

