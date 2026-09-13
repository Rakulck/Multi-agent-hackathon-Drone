const requiredEnvNames = [
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "GEMINI_API_KEY",
  "OPENWEATHER_API_KEY",
  "AIRTABLE_PERSONAL_ACCESS_TOKEN",
  "AIRTABLE_BASE_ID",
  "AIRTABLE_MEMORY_TABLE_NAME",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "SLACK_SIGNING_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_DEMO_RECIPIENT",
  "PUBLIC_APP_URL",
] as const;

const optionalEnvNames = [
  "GEMINI_MODEL",
  "LEMMA_API_KEY",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_FROM_NUMBER",
  "TWILIO_TO_NUMBER",
  "DELIVERY_CHOICE_SIGNING_SECRET",
] as const;

export type RequiredEnvName = (typeof requiredEnvNames)[number];
export type OptionalEnvName = (typeof optionalEnvNames)[number];

export const envSchema = {
  required: requiredEnvNames,
  optional: optionalEnvNames,
};

export function getMissingEnvNames(env: NodeJS.ProcessEnv = process.env): RequiredEnvName[] {
  return requiredEnvNames.filter((name) => !env[name]);
}
