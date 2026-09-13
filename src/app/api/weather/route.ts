import { NextResponse } from "next/server";
import { z } from "zod";
import { makeFallbackWeatherResponse } from "@/data/demo-weather";
import { fetchOpenWeatherConditions } from "@/services/weather";

export const runtime = "nodejs";

const requestSchema = z.object({
  pickup: z.object({
    label: z.string().min(1),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }),
  dropOff: z.object({
    label: z.string().min(1),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  }),
  mode: z.enum(["LIVE", "SAFE", "MODERATE", "UNSAFE"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      makeFallbackWeatherResponse("INVALID_RESPONSE", "Weather request body was invalid."),
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      makeFallbackWeatherResponse("INVALID_RESPONSE", "Pickup or drop-off coordinates were invalid."),
    );
  }

  const result = await fetchOpenWeatherConditions(parsed.data);
  return NextResponse.json(result);
}
