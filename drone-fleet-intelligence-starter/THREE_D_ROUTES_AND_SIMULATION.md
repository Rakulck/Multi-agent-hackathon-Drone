# 3D Routes and Simulation

## Purpose

The 3D map is a clear operational visualization, not a claim that Google Maps provides a live drone camera view or certified aerial navigation.

## Fixed scene

- One origin: store or dispatch hub.
- One destination: apartment delivery zone.
- Three hardcoded aerial waypoint corridors: Route A, Route B, Route C.
- Building-level tilted camera with enough altitude to see surrounding structures.

## Route states

| State | Color | Meaning |
|---|---|---|
| Candidate | Blue | Available but not selected |
| Selected | Green | Current approved route |
| Warning | Amber | Usable only with caution |
| Blocked | Red | Rejected by an active memory or rule |

## Hazard visualization

- Use a red translucent polygon/geofence around the crane coordinates.
- Place a label or marker: `Construction crane — temporary blockage`.
- Show the altitude band and expiry in the details panel.
- Do not model a complex 3D sphere for the MVP.

## Drone animation

- Interpolate a marker/model along the selected fixed waypoints.
- Animation should be time-based and deterministic.
- Mission 1 pauses at the detection point, records the hazard, and continues on Route C.
- Mission 2 rejects Route A before movement begins.

## Camera guidance

Use a tilted, follow-style camera for the visualization, but avoid claiming it is the aircraft’s optical point of view. The altitude belongs to route coordinates; tilt, range, heading, and center control the map camera.

