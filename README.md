# Drone Fleet Intelligence

Drone Fleet Intelligence is a human-in-the-loop delivery control system for a
mixed-vendor drone fleet. It combines deterministic safety rules with Google
Maps 3D, Gemini vision, OpenWeather, Slack approvals, Airtable operational
memory, and Twilio customer updates.

The main demo tells one connected story across two deliveries: the first drone
learns about a hazard, and a different drone uses that verified knowledge to
avoid the same hazard on its next mission.

## Links

- [Open the live Vercel app](https://multi-agent-hackathon-drone.vercel.app/)
- [Watch the demo video](https://drive.google.com/file/d/16IYKa9OLn9sjSL7Egjljxin62i7PcXSJ/view?usp=sharing)

## Demo walkthrough

### Before presenting

1. Start the app with `npm run dev` and open `http://localhost:3000`.
2. Make sure the Google Maps view loads and the integration indicators are
   connected.
3. Keep Slack open to the configured operator channel.
4. Keep the phone configured as `TWILIO_DEMO_RECIPIENT` nearby.
5. Begin with a clean demo by selecting **Reset** if an earlier run is visible.

### Order 1 — detect, approve, and learn

1. In **Mission Planning**, select **Order 1**. This loads a 4.5 kg grocery
   delivery from One Market Plaza to Gateway Apartments.
2. Watch the automatic preflight evaluate the request, fleet, weather,
   airspace, shared memory, routes, approval requirements, and final plan.
   With no existing crane memory, it selects **Atlas HeavyLift** and
   **Route A**.
3. Select **Launch Mission**. The dashboard switches to the live 3D view, and
   Twilio sends dispatch and pickup updates to the recipient.
4. Mid-flight, the simulated camera detects an obstacle. The drone immediately
   enters `HOLD`; Gemini identifies a construction crane, while deterministic
   geometry verifies that its location and altitude overlap Route A.
5. Slack asks the fleet operator to either:
   - approve a climb to **155 m** and continue Route A,
   - choose alternate **Route C**, or
   - return the drone home.
6. Approve one of the safe continuation options in Slack. The decision becomes
   a human-verified operational memory in Airtable, including its coordinates,
   altitude band, confidence, source mission, verification, and expiry.
7. The drone applies the approved mitigation, resumes flight, and completes
   the delivery.

**What this proves:** AI perception can describe a hazard, but it cannot
authorize flight. Deterministic safety checks stop the drone, a human approves
the mitigation, and only verified information is shared with the fleet.

### Order 2 — reuse memory before takeoff

1. Return to **Mission Planning** and select **Order 2**. This loads a 5.5 kg
   logistics delivery from Salesforce Tower to Pier 39.
2. During preflight, **CargoSwift S2** retrieves the crane memory learned by
   Atlas from Airtable. Route A is rejected before takeoff because it intersects
   the verified hazard. Route C is also unavailable under the demo airspace
   constraints, so the planner selects **Route B**.
3. Approve the route-change caution in Slack, then select **Launch Mission**.
4. Near the destination, ground activity blocks the original drop-off. The
   drone enters `HOLD`, and Twilio sends the recipient a secure link with
   **Terrace** and **Front Entrance** alternatives.
5. Open the link, choose an alternative, and confirm it. The server validates
   the selection against the blocked zone, route eligibility, weather, and
   battery reserve before updating the mission.
6. The dashboard changes the destination and final waypoint, the drone resumes,
   and the recipient receives a delivery confirmation naming the final
   drop-off.

**What this proves:** verified operational memory works across drone vendors,
unsafe routes are rejected before launch, and customer preferences are accepted
only after deterministic safety validation.

## System roles

- **Deterministic mission engine:** owns payload, fleet, weather-limit,
  airspace, route-overlap, battery, and drop-off safety decisions.
- **Google Maps 3D:** renders routes, altitude, hazards, telemetry, and flight
  animation.
- **Gemini:** performs bounded obstacle-image classification and returns
  structured observations; it never overrides safety rules.
- **Slack:** provides signed human approval for caution and live-hazard
  decisions.
- **Airtable:** stores and retrieves human-verified obstacle memory.
- **Twilio:** sends mission updates and secure alternate drop-off links.
- **OpenWeather:** provides live weather input; deterministic code applies the
  drone operating limits.

If Gemini, Slack, Airtable, Twilio, or weather data is unavailable, the system
fails safely instead of inventing approval or continuing an unsafe flight.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in the required values in `.env.local`:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GEMINI_API_KEY=
OPENWEATHER_API_KEY=
AIRTABLE_PERSONAL_ACCESS_TOKEN=
AIRTABLE_BASE_ID=
AIRTABLE_MEMORY_TABLE_NAME=Obstacle Memory
SLACK_BOT_TOKEN=
SLACK_CHANNEL_ID=
SLACK_SIGNING_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_DEMO_RECIPIENT=
PUBLIC_APP_URL=
DELIVERY_CHOICE_SIGNING_SECRET=
```

Only the Google Maps key is browser-visible. Keep every other credential
server-side.

For local Slack interactions and customer links, expose the app with
`ngrok http 3000`, set `PUBLIC_APP_URL` to the generated HTTPS origin, and set
the Slack app's interactivity request URL to
`https://<your-ngrok-host>/api/slack/interactions`. Twilio phone numbers must
use E.164 format, such as `+14155550123`; no inbound SMS webhook is required.

The secure customer-choice link expires after five minutes, contains no phone
number, and accepts only one selection. `DELIVERY_CHOICE_SIGNING_SECRET` should
be a strong random value.

## Failure paths worth demonstrating

- A Gemini failure leaves the drone in `HOLD` and creates no route approval or
  memory.
- A rejected Slack decision returns or stops the drone without activating the
  draft memory.
- A failed Twilio delivery keeps Order 2 in `HOLD` and requests Slack approval
  for a clearly labelled `DEMO_FALLBACK`.
- An unsafe customer alternative does not change the destination and triggers
  operator review.
- Reusing or opening an expired customer-choice link is rejected.

Customer communication is stored in server memory for this controlled demo.
A production multi-instance deployment should replace it with shared durable
storage.

## Automated checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
