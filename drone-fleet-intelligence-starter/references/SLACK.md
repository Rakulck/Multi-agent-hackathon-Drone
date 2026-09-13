# Slack Reference

## Role in the project

Send operational alerts to `#drone-alerts`, such as hazard detected, mission rerouted, mission paused, or human review required.

## Official documentation

- [Create and manage Slack apps](https://api.slack.com/apps)
- [`chat.postMessage`](https://docs.slack.dev/reference/methods/chat.postMessage)
- [Installing with OAuth](https://docs.slack.dev/authentication/installing-with-oauth)
- [Authorize the Slack CLI](https://docs.slack.dev/tools/slack-cli/guides/authorizing-the-slack-cli)
- [Node Slack SDK](https://docs.slack.dev/tools/node-slack-sdk/web-api)

## Minimum setup

- Install the app into the correct workspace.
- Add the `chat:write` bot scope.
- Copy the bot token beginning with `xoxb-` into a server-only environment variable.
- Invite the bot/app to `#drone-alerts`.
- Store the channel ID separately from the channel name.

## Important distinction

Slack CLI authentication proves the local CLI user can manage/deploy Slack projects. It does not replace the bot token used by the web application to call `chat.postMessage`.

## Common failures

- Using an app configuration token or CLI credential as the bot token.
- Bot was not invited to a private channel.
- Missing `chat:write` scope after installation; reinstall may be required.
- Confusing workspace ID, channel ID, and app ID.
- Running `slack run` outside a valid Slack CLI app directory; it is unnecessary for a simple Web API integration.

