# Cursor Prompt — 3D Route Simulation

Use this after the base dashboard works and when the hackathon build window permits implementation.

---

Extend the existing Drone Fleet Intelligence dashboard. Preserve the current architecture, styling, credentials, and working integrations. Build a controlled, deterministic Google Maps 3D mission simulation—not a physics engine and not a real drone-control system.

## Product story

The organization operates three supported drones from different fictional vendors. The orchestration layer normalizes their capabilities and shares operational memory across them.

Headline: **Different drones. One shared intelligence layer.**

## Google Maps 3D

Use the current official Google Maps JavaScript 3D APIs. Render a tilted building-level scene with:

- one dispatch origin;
- one apartment delivery destination;
- three hardcoded aerial waypoint arrays named `routeA`, `routeB`, and `routeC`;
- `Polyline3DElement` routes using altitude-aware coordinates;
- markers for origin, destination, drone, and detected hazard;
- a translucent red `Polygon3DElement` geofence around the crane;
- a readable route legend.

Do not use Aerial View video as the mission renderer. Do not imply the map camera is the drone's live optical camera. Keep waypoints and altitude data in a dedicated typed demo-data module so they can be changed easily.

Route colors:

- candidate: blue;
- selected: green;
- warning: amber;
- blocked: red.

Animate a simple drone marker/model by interpolating deterministically along the selected waypoint array. Camera follow is optional and must not make the map unstable.

## Fleet and order

Use this fleet:

- Atlas HeavyLift / Atlas Robotics / 8 kg / 18 km / 86% / Available.
- CargoSwift S2 / Stratos Aviation / 6 kg / 24 km / 92% / Available.
- MiniDrop N3 / Nimble Air / 2 kg / 12 km / 78% / Available.

Use a 4.5 kg grocery order to the apartment destination.

## Controlled state machine

Implement explicit states such as `READY`, `EVALUATING`, `APPROVED`, `IN_FLIGHT`, `HAZARD_DETECTED`, `REROUTING`, `DELIVERED`, and `ERROR`. Prevent double clicks and invalid transitions.

### Run Mission 1

1. Evaluate the order.
2. Reject MiniDrop because 4.5 kg exceeds its 2 kg capacity.
3. Select Atlas HeavyLift.
4. Select Route A.
5. Animate Atlas along Route A.
6. At a fixed detection point, trigger a clearly labeled simulated crane sensor event.
7. Pause movement, mark Route A blocked, draw the crane geofence, and create a structured memory record.
8. Reroute to Route C and complete delivery.
9. Persist the memory locally so refresh/re-render does not immediately lose the demo.
10. Add timeline events and UI placeholders for later Airtable write, Slack operator alert, and Twilio customer update.

### Run Mission 2

1. Make Atlas status `Charging`.
2. Use the same destination and order weight.
3. Select CargoSwift S2 from Stratos Aviation.
4. Retrieve the active Mission 1 crane memory before takeoff.
5. Reject Route A and cite the memory record ID.
6. Mark Route B amber because of a fixed temporary courtyard warning.
7. Select Route C in green.
8. Animate CargoSwift directly along Route C and complete delivery.

The dashboard must make this cross-vendor transfer visually undeniable: `Learned by Atlas HeavyLift → used by CargoSwift S2`.

### Reset Demo

Restore the original fleet, routes, timeline, mission state, and demo memory predictably. Do not clear unrelated browser storage.

## Rules

- Payload, availability, range/battery, wind limits, memory expiry, and blocked-route enforcement must be deterministic TypeScript.
- Do not use an LLM for arithmetic or to override safety checks.
- No marketplace, prices, bidding, customer drone picker, real autopilot, PX4, regulatory approval, or dynamic pathfinding in this task.
- Handle missing Maps key and Maps load failures with a polished fallback panel.
- Keep all secrets except the restricted browser Maps key on the server.

## Acceptance criteria

- Route A/B/C and buildings are visible in 3D.
- Mission 1 visibly creates the crane memory and reroutes.
- Mission 2 uses a different vendor's drone and avoids Route A before takeoff.
- The precise memory ID is displayed.
- Reset works repeatedly.
- No TypeScript, lint, or production-build errors.
- The entire story can be demonstrated in under two minutes.

Before editing, summarize the files you plan to touch. After implementation, run lint and production build and report the result.

---

