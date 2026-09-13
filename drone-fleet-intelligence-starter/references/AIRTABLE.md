# Airtable Reference

## Role in the project

Persist fleet records, missions, orders, and shared obstacle-memory records. The most important proof is Mission 1 writing a memory and Mission 2 retrieving it.

## Official documentation

- [Web API introduction](https://airtable.com/developers/web/api/introduction)
- [Create and manage personal access tokens](https://airtable.com/create/tokens)
- [Official Airtable JavaScript client](https://github.com/Airtable/airtable.js)

## Required values

- Personal access token: secret, server-only.
- Base ID: currently `appMaSynuwNjscmig`.
- Exact table names and field names from the generated base.

## Suggested token access

Grant only the scopes and base access required for reading/writing the project records. Typical needs are record read/write access and enough schema read access to diagnose names. Do not grant access to unrelated bases.

## Suggested tables

- `Orders`
- `Drones`
- `Missions`
- `Obstacle Memory`

## Common failures

- Using an old legacy API key instead of a personal access token.
- Token has scopes but not access to the selected base.
- Table/field name differs by spacing or capitalization.
- Calling Airtable directly from browser code and exposing the token.
- Forgetting pagination or assuming an empty response means failure.

