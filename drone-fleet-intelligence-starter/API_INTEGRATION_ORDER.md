# API Integration Order

Connect services in the order that protects the demo's core story.

| Order | Service | Proof to obtain before continuing |
|---:|---|---|
| 1 | Google Maps 3D | One stable tilted map renders with a marker and polyline |
| 2 | Airtable | Create a test memory, read it back, then delete/expire only that test record |
| 3 | Slack | Bot posts one message into `#drone-alerts` |
| 4 | Twilio | Trial recipient receives one permitted delivery update |
| 5 | OpenWeather | Server returns normalized wind speed with units and timestamp |
| 6 | Gemini | One schema-constrained response passes Zod validation |
| 7 | Lemma | Optional trace appears for one controlled decision |

## Integration rule

Test each service through a tiny server-side route before connecting it to the mission state machine. Keep a visible status indicator and a safe fallback for every service.

