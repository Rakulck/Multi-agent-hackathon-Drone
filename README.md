# Drone Fleet Intelligence

## Twilio customer communication

Twilio sends recipient-facing mission updates. Slack remains the fleet
operator review channel, and Airtable remains the obstacle-memory system. A
customer uses a short-lived secure web link to choose an alternate drop-off;
server-side deterministic checks decide whether that preference is safe.

Configure these server-only values in `.env` locally and in the Vercel project
environment for production:

```dotenv
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_DEMO_RECIPIENT=
PUBLIC_APP_URL=
DELIVERY_CHOICE_SIGNING_SECRET=
```

Do not prefix any Twilio variable with `NEXT_PUBLIC_`. Both phone numbers must
use E.164 format, such as `+14155550123`.

No inbound SMS webhook is required. For local testing, start
`ngrok http 3000` and set `PUBLIC_APP_URL` to its active HTTPS origin. For
production, use the deployed Vercel HTTPS origin. Outbound messages
automatically use `/api/twilio/status` for delivery status callbacks.

`DELIVERY_CHOICE_SIGNING_SECRET` should be a strong random server-side value.
When omitted, the server uses an existing Twilio server credential as the
signing key. Choice links expire after five minutes, contain only the mission
ID and an opaque customer identifier, and accept at most one selection.

The current Airtable integration has only the obstacle-memory table. Customer
communication is therefore retained in a small server-only in-memory store
for this controlled demo; it does not modify the obstacle table. A production
multi-instance deployment should replace this store with shared durable
storage.

## Run and verify

```bash
npm install
npm run dev
```

1. Open the app and create a mission.
2. Keep **Use server-side TWILIO_DEMO_RECIPIENT** selected, or clear it and
   enter a custom E.164 recipient.
3. Complete each preflight step and any existing Slack caution approval.
4. Launch the mission. Confirm the recipient gets the dispatch and package
   pickup updates.
5. Confirm the approaching message uses the mission's entered drop-off name
   and displayed ETA.
6. Run Mission 2. At the blocked final drop-off, confirm the drone enters
   `HOLD` and the recipient receives a secure `/delivery-choice/...` link.
7. Open the link on a mobile browser. Confirm it shows the mission ID, current
   status, Terrace, Front Entrance, and a disabled Confirm button until one
   option is selected.
8. Select Terrace and confirm. Verify the success screen says “Drop-off
   updated. You may close this page.” The dashboard should record `SAFE`,
   update Route C and its map label, and resume automatically.
9. Repeat Mission 2 and choose Front Entrance. Confirm the same deterministic
   flow updates the destination.
10. Reuse a submitted link and verify the duplicate selection is rejected.
   Wait more than five minutes with a fresh link and verify it is expired.
11. On completion, confirm the final SMS names the selected final drop-off and
    includes the mission ID.
12. To test communication failure, temporarily use invalid Twilio credentials
    in a local test environment and restart the server. Flight success must
    remain independent of the failed update. At the blocked drop-off, confirm
    the dashboard shows `DEMO_FALLBACK`, remains in `HOLD`, and requests Slack
    operator review.

The unsafe-alternative branch is deterministic and covered by the automated
suite using an alternate that overlaps a blocked zone. It verifies that the
destination remains unchanged and a Slack operator alert is requested.

## Automated checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
