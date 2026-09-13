# Demo Story

## Opening

“Commercial fleets can contain drones from different vendors, but their capabilities and mission knowledge are fragmented. We give the fleet one shared operational brain.”

## Mission 1 — learn

- A 4.5 kg grocery order is submitted.
- MiniDrop N3 is rejected because its payload limit is 2 kg.
- Atlas HeavyLift is selected because it is available and capable.
- Route A is initially selected.
- During the simulation, the drone encounters a temporary construction crane.
- The mission reroutes safely to Route C.
- The hazard is stored with coordinates, altitude band, radius, severity, confidence, source drone, observation time, and expiry.
- Slack receives an operator alert and Twilio sends a customer update.

## Mission 2 — reuse

- A second order goes to the same apartment complex.
- Atlas is now charging, so the normalized fleet layer selects CargoSwift S2 from another vendor.
- Before takeoff, the agent retrieves the crane memory.
- Route A is rejected because of the active crane memory.
- Route B has a courtyard-approach warning.
- Route C is selected and completed.
- The dashboard identifies the exact memory record used.

## Closing

“The first drone had to learn the hard way. The next one didn’t have to.”

## What the judge should see

- Drone eligibility changing in real time.
- Route colors and rejection reasons changing.
- A new Airtable memory record appearing.
- A real Slack message.
- A real Twilio delivery update.
- Mission 2 explicitly retrieving Mission 1’s memory.

