# Mixed-Vendor Fleet Normalization

## Why this matters

“Multiple drones” is not enough to establish differentiation. The demo should say and show that the aircraft come from different fictional vendors and expose different capabilities. The platform converts those differences into one internal capability model.

## Demo fleet

| Drone | Vendor | Payload | Range | Battery | Special capability |
|---|---|---:|---:|---:|---|
| Atlas HeavyLift | Atlas Robotics | 8 kg | 18 km | 86% | Heavy payload |
| CargoSwift S2 | Stratos Aviation | 6 kg | 24 km | 92% | Long range, insulated bay |
| MiniDrop N3 | Nimble Air | 2 kg | 12 km | 78% | Small and efficient |

## Normalized fields

- Internal drone ID.
- Vendor and model.
- Availability state.
- Maximum payload.
- Estimated remaining range.
- Current battery percentage.
- Maximum supported wind threshold.
- Sensor/camera capability tags.
- Payload-bay capability tags.
- Current location.

## Selection order

1. Reject unavailable drones.
2. Reject drones below payload capacity.
3. Reject drones without sufficient range plus reserve.
4. Reject drones outside weather limits.
5. Rank remaining drones for mission fit.
6. Explain the winning choice in one short sentence.

The rejection rules are deterministic. Gemini may summarize or rank already-eligible choices; it must not override a failed guardrail.

