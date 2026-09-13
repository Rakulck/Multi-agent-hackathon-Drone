# Data Model

## Order

- `orderId`
- `customerName`
- `destinationLat`
- `destinationLng`
- `packageWeightKg`
- `deliveryType`
- `priority`
- `status`

## Drone

- `droneId`
- `vendor`
- `model`
- `status`
- `maxPayloadKg`
- `estimatedRangeKm`
- `batteryPercent`
- `minimumReservePercent`
- `maxWindMps`
- `capabilities[]`
- `currentLat`
- `currentLng`

## Route

- `routeId`
- `name`
- `waypoints[]` containing latitude, longitude, and altitude.
- `distanceKm`
- `status`
- `riskReason`
- `memoryIds[]`

## Mission

- `missionId`
- `orderId`
- `selectedDroneId`
- `selectedRouteId`
- `state`
- `rejectedDrones[]`
- `rejectedRoutes[]`
- `memoryRecordsUsed[]`
- `startedAt`
- `completedAt`
- `humanApprovalRequired`
- `reasoningBrief`

## Obstacle memory

- `memoryId`
- `hazardType`
- `latitude`
- `longitude`
- `altitudeMinM`
- `altitudeMaxM`
- `radiusM`
- `severity`
- `confidence`
- `sourceDroneId`
- `sourceVendor`
- `sourceMissionId`
- `observedAt`
- `expiresAt`
- `verificationCount`
- `status`

## Integration event

- `eventId`
- `missionId`
- `service`
- `eventType`
- `status`
- `attemptedAt`
- `errorCode`
- `safeMessage`

Do not store API secrets, Twilio Auth Tokens, Slack bot tokens, or full raw provider responses in Airtable records or client-visible mission events.

