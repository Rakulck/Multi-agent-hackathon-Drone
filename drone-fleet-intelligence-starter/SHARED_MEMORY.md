# Shared Operational Memory

## Core promise

A supported drone should not have to rediscover a known local hazard merely because it comes from another vendor.

## Memory record

Each record should contain:

- Memory/obstacle ID.
- Hazard type.
- Latitude and longitude.
- Altitude minimum and maximum.
- Avoidance radius.
- Severity: `BLOCKED`, `WARNING`, or `INFO`.
- Confidence.
- Source drone and source vendor.
- Source mission.
- Observation time.
- Expiration time.
- Verification count.
- Status: active, disputed, expired, or cleared.
- Optional evidence URL or image reference.

## Retrieval rule

Before route approval, query active memories near the candidate corridor and destination. A memory should only affect a route when its geographic/altitude area overlaps the route and it has not expired.

## Demo memories

1. Construction crane: blocks Route A; longer expiry; high severity.
2. Courtyard obstruction: warns on Route B; short expiry; medium severity.

## Reliability controls

- Time-to-live prevents temporary hazards from becoming permanent.
- Confidence and source identify uncertain reports.
- Repeated observations may increase confidence.
- A human can clear or dispute a record.
- Mission 2 must display the record ID that changed its decision.

## Honest MVP claim

The hackathon prototype proves centralized cross-drone memory within one organization. Cross-company sharing, incentives, trust scoring, and regulatory governance are future work.

