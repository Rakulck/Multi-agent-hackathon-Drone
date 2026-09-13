# Cursor Prompt — Base Environment and Dashboard Shell

Paste the following into Cursor at the root of the existing `Drone-hackathon` project.

---

Inspect the existing repository before changing anything. Preserve the current `.env`, `package.json`, lock file, Twilio setup, and all user files. Do not expose, print, rename, or overwrite any credential. If the repository already uses Next.js or another coherent React stack, adapt it instead of recreating the project.

We are preparing a reusable base for a hackathon project called **Drone Fleet Intelligence**. The locked positioning is:

> Different drones. One shared intelligence layer.

This is a B2B operations dashboard for one organization managing a heterogeneous, mixed-vendor fleet. It is not a marketplace and not a consumer drone-rental product.

## Task 1 — environment

If this is not already a Next.js App Router TypeScript project, initialize the minimum equivalent structure in the current repository without deleting existing work. Use Tailwind CSS and ESLint. Confirm Node.js 20 or newer.

Install only missing packages from this list, using current mutually compatible versions:

- `zod`
- `airtable`
- `twilio`
- `@slack/web-api`
- `@google/genai`
- `lucide-react`
- `clsx`
- `tailwind-merge`

Create or update `.gitignore` so `.env`, `.env.local`, build output, logs, and dependency folders are ignored. Create `.env.example` containing variable names only. Only the Google Maps key may use a `NEXT_PUBLIC_` prefix; every other credential must stay server-only.

## Task 2 — modular dashboard shell

Build a responsive single-page operations dashboard with mock data only. Do not implement mission simulation, shared-memory logic, or real API calls yet.

Visual direction: dark graphite operations console, white typography, restrained blue accents, amber warnings, red blocked states, green approvals. Avoid playful consumer-delivery styling.

Create:

1. Top bar with product name, tagline, `SIMULATION` badge, six connection-status placeholders, and Reset button.
2. KPI strip for active mission, available drones, active hazards, and ETA.
3. Main left panel: large map placeholder labeled `Google Maps 3D mission view` with Route A/B/C legend.
4. Main right panel: mission intelligence placeholder showing order, guardrails, selected drone, selected route, memory consulted, and current status.
5. Lower mixed-vendor fleet table using these rows:
   - Atlas HeavyLift / Atlas Robotics / 8 kg / 18 km / 86% / Available
   - CargoSwift S2 / Stratos Aviation / 6 kg / 24 km / 92% / Available
   - MiniDrop N3 / Nimble Air / 2 kg / 12 km / 78% / Available
6. Live event timeline placeholder.
7. Shared operational memory card placeholder.
8. Three disabled controls labeled Run Mission 1, Run Mission 2, and Reset Demo, with helper text saying core mission behavior will be added during the build.

Use small reusable components and typed mock data. Keep the page legible at 1440×900 and usable on tablet widths. Add loading, empty, success, warning, and error visual variants to the shared card primitives.

## Task 3 — safe integration boundaries

Create typed service placeholders for Airtable, Gemini, Slack, Twilio, and OpenWeather. Each placeholder must be server-only and throw a clear `Not implemented` error. Do not make external requests. Add an environment validation module that identifies missing variables without ever logging their values.

Create empty map component boundaries that can later contain Google Maps 3D elements without forcing the whole page to be client-rendered.

## Task 4 — verification

Run lint and production build. Fix all errors. Then report:

- files created or changed;
- packages installed;
- commands used to run the app;
- any existing repository decisions you preserved;
- any missing environment-variable names.

Do not implement the judged Mission 1/Mission 2 learning loop in this setup task.

---

