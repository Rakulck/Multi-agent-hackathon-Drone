# Goals and Scope

## Hackathon goal

Prove one complete, understandable loop:

1. A delivery request enters the system.
2. Deterministic rules reject ineligible drones.
3. The agent selects and explains an eligible drone and route.
4. A simulated flight encounters and records a hazard.
5. A later flight by another vendor's drone retrieves that memory before takeoff.
6. The second mission avoids the known route and succeeds.
7. Airtable, Slack, Twilio, weather, and the dashboard visibly reflect the decision.

## In scope

- One organization with three fictional mixed-vendor drones.
- One grocery-delivery scenario.
- Three fixed aerial route alternatives.
- One simulated construction-crane event.
- One secondary landing-zone warning.
- Deterministic payload, availability, range/battery, and weather checks.
- Gemini for bounded classification, extraction, ranking, or explanation.
- Persistent obstacle memory in Airtable.
- Google Maps 3D visualization.
- Slack operator alerts and Twilio customer updates.
- Controlled state-machine demo with reset.

## Out of scope

- A public drone marketplace or consumer drone selection UI.
- Real aircraft control or PX4 integration in the hackathon MVP.
- Physics-accurate flight dynamics.
- Live BVLOS authorization, UTM, LAANC, or air-traffic separation.
- Certified collision avoidance or centimeter-accurate landing.
- Multi-city routing, payments, pricing, insurance, or operator bidding.
- Unbounded autonomous action by an LLM.

## Success criteria

- A judge understands the problem and payoff within two minutes.
- Mission 1 creates a memory that did not exist before.
- Mission 2 visibly cites and uses that memory.
- A different-vendor drone demonstrates normalization across the fleet.
- All hard safety checks work even if Gemini is unavailable.
- API failures pause or degrade safely and are visible in the UI.

