# Twilio Reference

## Role in the project

Send customer-facing delivery updates. Twilio failure should never change flight-safety logic.

## Official documentation

- [Send SMS with Node.js](https://www.twilio.com/docs/messaging/tutorials/how-to-send-sms-messages/node-js)
- [API keys in the Twilio Console](https://www.twilio.com/docs/iam/api-keys/keys-in-console)
- [Use a Twilio trial account](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account)
- [Access Tokens](https://www.twilio.com/docs/iam/access-tokens)

## Required values

- `TWILIO_ACCOUNT_SID`.
- `TWILIO_AUTH_TOKEN`.
- `TWILIO_PHONE_NUMBER` (the Twilio `From` number).
- `TWILIO_DEMO_RECIPIENT` (a verified trial recipient in E.164 format).
- `PUBLIC_APP_URL` (ngrok HTTPS origin locally or the Vercel origin in production).
- `DELIVERY_CHOICE_SIGNING_SECRET` (recommended dedicated HMAC secret).

No inbound SMS webhook is required. When a customer decision is needed,
Twilio sends a short-lived `/delivery-choice/[secureToken]` link. The web
selection is evaluated by the deterministic safety engine before any route or
destination change.

## Important distinction

Access Tokens are primarily short-lived credentials for Twilio client SDK products. A backend SMS sender normally authenticates with the Account SID/Auth Token or an API Key SID/Secret. Do not place any of these in client-side code.

## Trial limitations

- Recipients generally must be verified.
- Messages may include trial branding.
- Geographic and messaging-policy restrictions still apply.
- The console's “Try out SMS” flow may use a predefined body or template; confirm the same body that succeeded during setup.

## Demo messages

- Mission delayed due to a temporary route hazard.
- Route safely updated; revised ETA.
- Delivery completed.

