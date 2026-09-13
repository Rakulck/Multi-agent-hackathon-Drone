# Environment and Packages

## Recommended stack

- Node.js 20 LTS or newer compatible runtime.
- Next.js App Router with TypeScript.
- Tailwind CSS.
- Server-side route handlers for secret-bearing API calls.
- Browser-side Google Maps 3D rendering.
- Zod for validating internal data and Gemini output.

## Create a new app only if one does not exist

```bash
npx create-next-app@latest drone-fleet-intelligence --typescript --tailwind --eslint --app --src-dir --use-npm
cd drone-fleet-intelligence
```

## Core packages

```bash
npm install zod airtable twilio @slack/web-api @google/genai lucide-react clsx tailwind-merge
```

Do not reinstall a dependency that is already present merely to change its version. Let npm resolve mutually compatible current versions, then commit the lock file when the event rules allow it.

## Optional development packages

```bash
npm install -D prettier prettier-plugin-tailwindcss
```

## Suggested source structure

```text
src/
  app/
    api/
      airtable/
      gemini/
      notify/
      weather/
    page.tsx
  components/
    dashboard/
    fleet/
    map/
    memory/
    mission/
  lib/
    env.ts
    guardrails.ts
    mission-machine.ts
    schemas.ts
  services/
    airtable.ts
    gemini.ts
    slack.ts
    twilio.ts
    weather.ts
  data/
    demo-fleet.ts
    demo-routes.ts
  types/
    domain.ts
```

## Security boundary

Only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` should be readable by the browser. Airtable, Slack, Twilio, Gemini, and OpenWeather secrets stay server-side. Never print them in logs, screenshots, client bundles, or Git history.

## Basic checks

```bash
npm run lint
npm run build
npm run dev
```

Use Node 20+ because current Slack Web API tooling requires it. If an existing project is on an older Node version, upgrade the runtime before debugging package errors.

