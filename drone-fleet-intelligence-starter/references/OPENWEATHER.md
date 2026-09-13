# OpenWeather Reference

## Role in the project

Provide current wind and weather inputs for deterministic preflight guardrails.

## Official documentation

- [OpenWeather APIs](https://openweathermap.org/api)
- [Current Weather Data](https://openweathermap.org/current)

## Required values

- Server-only API key.
- Mission latitude and longitude.
- Explicit units.

## Guardrail guidance

- Convert units once at the service boundary and store the normalized unit with the value.
- Treat missing, malformed, or stale weather as a mission pause before takeoff.
- Do not claim a general public weather API replaces aviation weather services or on-aircraft sensing.
- For a deterministic demo, provide a clearly labeled failure toggle rather than depending on real bad weather.

## Common failures

- Confusing meters per second with miles per hour.
- New API key has not propagated yet.
- Calling a product endpoint not included in the selected plan.
- Browser-side call exposes the key.

