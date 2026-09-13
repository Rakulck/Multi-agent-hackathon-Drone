# Gemini Reference

## Role in the project

Use Gemini only for bounded language/vision work: request extraction, simulated obstacle-image classification, ranking already-eligible choices, and concise explanations.

## Official documentation

- [Gemini API documentation](https://ai.google.dev/gemini-api/docs)
- [JavaScript quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Function calling](https://ai.google.dev/gemini-api/docs/function-calling)

## Setup

- Use the official `@google/genai` package.
- Keep `GEMINI_API_KEY` server-only.
- Request structured output and validate it again with Zod.
- Pin a model name in configuration rather than scattering it through components.

## Safety boundary

Gemini does not own payload arithmetic, battery/range thresholds, weather limits, memory expiry, or blocked-route enforcement. If Gemini is unavailable or returns invalid data, deterministic code remains authoritative.

## Prompt-output principles

- Provide only relevant eligible drones and route facts.
- Require record IDs for cited memories.
- Disallow invented telemetry and coordinates.
- Keep the explanation to one sentence for demo clarity.
- Log validation success/failure, not hidden reasoning.

