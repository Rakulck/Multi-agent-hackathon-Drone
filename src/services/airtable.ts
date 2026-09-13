import "server-only";

import { z } from "zod";
import type { MemoryApiResponse, MemoryFetchState, OperationalMemory } from "@/types/domain";

const AIRTABLE_API_URL = "https://api.airtable.com/v0";
const AIRTABLE_METADATA_API_URL = `${AIRTABLE_API_URL}/meta/bases`;
const REQUEST_TIMEOUT_MS = 8_000;
const DUPLICATE_DISTANCE_M = 30;

const airtableRecordSchema = z.object({
  id: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
});

const listResponseSchema = z.object({
  records: z.array(airtableRecordSchema),
  offset: z.string().optional(),
});

const createResponseSchema = z.object({
  records: z.array(airtableRecordSchema).min(1),
});

const airtableFieldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  options: z
    .object({
      choices: z.array(z.object({ name: z.string().min(1) })).optional(),
    })
    .optional(),
});

const airtableTableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  primaryFieldId: z.string().min(1),
  fields: z.array(airtableFieldSchema),
});

const metadataResponseSchema = z.object({
  tables: z.array(airtableTableSchema),
});

const structuredMemoryDetailsSchema = z.object({
  memoryId: z.string().min(1),
  routeId: z.enum(["A", "B", "C"]),
  altitudeBandM: z.tuple([z.number().finite(), z.number().finite()]),
  avoidanceRadiusM: z.number().finite().positive(),
  sourceVendor: z.string().min(1),
  sourceMission: z.string().min(1),
  expiresAt: z.string().datetime(),
  verificationStatus: z.literal("Human Verified"),
  verifiedAt: z.string().datetime(),
  verifiedBy: z.string().min(1),
});

interface SanitizedUpstreamError {
  statusCode: number;
  errorType?: string;
  message: string;
}

class AirtableServiceError extends Error {
  constructor(
    readonly state: Exclude<MemoryFetchState, "IDLE" | "LOADING" | "SUCCESS" | "SUCCESS_EMPTY">,
    message: string,
    readonly statusCode?: number,
    readonly upstream?: SanitizedUpstreamError,
  ) {
    super(message);
  }
}

export async function loadActiveAirtableMemories(): Promise<MemoryApiResponse> {
  const config = getConfig();
  if (!config) {
    return failure("MISSING_KEY", "Airtable credentials or memory table name are missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const memories = await loadAndExpireMemories(config, controller.signal);
    return {
      status: memories.length === 0 ? "SUCCESS_EMPTY" : "SUCCESS",
      memories,
      message:
        memories.length === 0
          ? "No relevant shared hazards found."
          : `${memories.length} active, verified, non-expired Airtable memor${memories.length === 1 ? "y" : "ies"} loaded.`,
      source: "AIRTABLE",
    };
  } catch (error) {
    return handleError(error);
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

export async function createAirtableMemoryRecord(memory: OperationalMemory): Promise<MemoryApiResponse> {
  if (
    memory.status !== "Active" ||
    memory.verificationStatus !== "Human Verified" ||
    !memory.verifiedAt ||
    !memory.verifiedBy
  ) {
    return failure(
      "INVALID_RESPONSE",
      "Only active operational memory verified by a human operator can be saved to Airtable.",
    );
  }

  const config = getConfig();
  if (!config) {
    return failure("MISSING_KEY", "Airtable credentials or memory table name are missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const activeMemories = await loadAndExpireMemories(config, controller.signal);
    const duplicate = activeMemories.find((candidate) => isDuplicate(candidate, memory));

    if (duplicate) {
      return {
        status: "SUCCESS",
        memories: [duplicate],
        message: `Duplicate prevented; active Airtable record ${duplicate.id} already covers this obstacle and time window.`,
        source: "AIRTABLE",
        duplicate: true,
        airtableRecordId: duplicate.airtableRecordId,
      };
    }

    const table = await loadConfiguredTableSchema(config, controller.signal);
    const fields = toConfiguredAirtableFields(memory, table);
    const response = await postMemoryFields(config, table.id, fields, controller.signal);
    const parsed = createResponseSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new AirtableServiceError("API_FAILURE", "Airtable create response was missing required memory fields.");
    }

    const saved = fromAirtableRecord(parsed.data.records[0]);
    if (!saved) {
      throw new AirtableServiceError("API_FAILURE", "Airtable create response did not contain a valid operational memory.");
    }
    return {
      status: "SUCCESS",
      memories: [saved],
      message: `Memory ${saved.id} saved to Airtable.`,
      source: "AIRTABLE",
      duplicate: false,
      airtableRecordId: saved.airtableRecordId,
    };
  } catch (error) {
    return handleError(error);
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

async function loadAndExpireMemories(config: AirtableConfig, signal: AbortSignal): Promise<OperationalMemory[]> {
  const records: z.infer<typeof airtableRecordSchema>[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);

    const response = await airtableFetch(config, `?${params.toString()}`, { method: "GET", signal });
    const parsed = listResponseSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new AirtableServiceError("API_FAILURE", "Airtable returned malformed operational-memory data.");
    }
    records.push(...parsed.data.records);
    offset = parsed.data.offset;
  } while (offset);

  const now = Date.now();
  return records
    .map(fromAirtableRecord)
    .filter((memory): memory is OperationalMemory => Boolean(memory))
    .filter(
      (memory) =>
        memory.status === "Active" &&
        memory.verificationStatus === "Human Verified" &&
        Boolean(memory.verifiedAt) &&
        new Date(memory.expiresAt).getTime() > now,
    );
}

function postMemoryFields(
  config: AirtableConfig,
  tableId: string,
  fields: Record<string, string | number | boolean>,
  signal: AbortSignal,
) {
  return airtableFetch(config, "", {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields }],
      typecast: false,
    }),
    signal,
  }, tableId);
}

async function airtableFetch(
  config: AirtableConfig,
  suffix: string,
  init: Pick<RequestInit, "method" | "body" | "signal">,
  tableRef = config.tableName,
) {
  let response: Response;
  try {
    response = await fetch(
      `${AIRTABLE_API_URL}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(tableRef)}${suffix}`,
      {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AirtableServiceError("API_FAILURE", "Airtable could not be reached.");
  }

  if (!response.ok) {
    const upstream = await readAirtableError(response, config.token);
    throw new AirtableServiceError(
      "API_FAILURE",
      `Airtable returned HTTP ${upstream.statusCode}: ${upstream.message}`,
      response.status,
      upstream,
    );
  }
  return response;
}

async function loadConfiguredTableSchema(
  config: AirtableConfig,
  signal: AbortSignal,
): Promise<z.infer<typeof airtableTableSchema>> {
  let response: Response;
  try {
    response = await fetch(
      `${AIRTABLE_METADATA_API_URL}/${encodeURIComponent(config.baseId)}/tables`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${config.token}` },
        signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AirtableServiceError("API_FAILURE", "Airtable metadata API could not be reached.");
  }

  if (!response.ok) {
    const upstream = await readAirtableError(response, config.token);
    throw new AirtableServiceError(
      "API_FAILURE",
      `Airtable metadata API returned HTTP ${upstream.statusCode}: ${upstream.message}`,
      response.status,
      upstream,
    );
  }

  const parsed = metadataResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new AirtableServiceError(
      "API_FAILURE",
      "Airtable metadata API returned an invalid table schema.",
    );
  }
  const table = parsed.data.tables.find(
    (candidate) =>
      candidate.name === config.tableName || candidate.id === config.tableName,
  );
  if (!table) {
    throw new AirtableServiceError(
      "API_FAILURE",
      `Configured Airtable table "${sanitizeText(config.tableName, config.token)}" was not found in base metadata.`,
    );
  }
  return table;
}

async function readAirtableError(
  response: Response,
  token: string,
): Promise<SanitizedUpstreamError> {
  let errorType: string | undefined;
  let message = response.statusText || "Airtable request failed.";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const error = (body as { error?: unknown }).error;
      if (typeof error === "string") {
        message = error;
      } else if (error && typeof error === "object") {
        const candidate = error as { type?: unknown; message?: unknown };
        if (typeof candidate.type === "string") errorType = candidate.type;
        if (typeof candidate.message === "string") message = candidate.message;
      }
    }
  } catch {
    // Keep the sanitized HTTP status text when Airtable returns a non-JSON body.
  }
  return {
    statusCode: response.status,
    errorType: errorType ? sanitizeText(errorType, token) : undefined,
    message: sanitizeText(message, token),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AirtableServiceError("API_FAILURE", "Airtable returned invalid JSON.");
  }
}

function toConfiguredAirtableFields(
  memory: OperationalMemory,
  table: z.infer<typeof airtableTableSchema>,
): Record<string, string | number | boolean> {
  if (
    memory.verificationStatus !== "Human Verified" ||
    !memory.verifiedAt ||
    !memory.verifiedBy
  ) {
    throw new AirtableServiceError(
      "INVALID_RESPONSE",
      "Airtable memory payload is missing human-verification metadata.",
    );
  }
  const writable: Record<string, string | number | boolean> = {};
  const fieldsByName = new Map(table.fields.map((field) => [field.name, field]));

  function setField(
    name: string,
    expectedType: string,
    value: string | number | boolean,
  ) {
    const field = fieldsByName.get(name);
    if (!field) {
      throw new AirtableServiceError(
        "INVALID_RESPONSE",
        `Airtable schema mismatch: required writable field "${name}" is missing.`,
      );
    }
    if (field.type !== expectedType) {
      throw new AirtableServiceError(
        "INVALID_RESPONSE",
        `Airtable schema mismatch: "${name}" is ${field.type}, expected ${expectedType}.`,
      );
    }
    writable[name] = value;
  }

  const obstacleField = fieldsByName.get("Obstacle Type");
  if (!obstacleField || obstacleField.type !== "singleSelect") {
    throw new AirtableServiceError(
      "INVALID_RESPONSE",
      'Airtable schema mismatch: "Obstacle Type" must be a singleSelect field.',
    );
  }
  const obstacleType = mapObstacleTypeToChoice(
    memory.hazardType,
    obstacleField.options?.choices?.map((choice) => choice.name) ?? [],
  );
  const structuredDetails = {
    memoryId: memory.id,
    routeId: memory.routeId,
    altitudeBandM: memory.altitudeBandM,
    avoidanceRadiusM: memory.avoidanceRadiusM,
    sourceVendor: memory.sourceVendor,
    sourceMission: memory.sourceMission,
    expiresAt: memory.expiresAt,
    verificationStatus: memory.verificationStatus,
    verifiedAt: memory.verifiedAt,
    verifiedBy: memory.verifiedBy,
  };

  setField(
    "Building Address",
    "singleLineText",
    `Route ${memory.routeId} · ${memory.sourceMission}`,
  );
  setField("Latitude", "number", memory.latitude);
  setField("Longitude", "number", memory.longitude);
  setField("Obstacle Type", "singleSelect", obstacleType);
  setField("Severity", "singleSelect", memory.severity);
  setField(
    "Description",
    "multilineText",
    `${memory.summary}\nDRONE_MEMORY_JSON:${JSON.stringify(structuredDetails)}`,
  );
  setField(
    "Alternative Delivery Point",
    "singleLineText",
    `Avoid ${memory.avoidanceRadiusM} m radius; use alternate Route ${memory.routeId === "C" ? "B" : "C"}`,
  );
  setField("Last Detected Time", "dateTime", memory.createdAt);
  setField("Active Status", "checkbox", memory.status === "Active");
  setField("Confidence Score", "percent", memory.confidence);
  setField("Verification Required", "checkbox", false);
  setField(
    "Reporter",
    "singleLineText",
    `${memory.learnedBy} · ${memory.sourceVendor}`,
  );

  return writable;
}

function mapObstacleTypeToChoice(
  hazardType: string,
  availableChoices: string[],
): string {
  const normalized = hazardType.toLowerCase();
  const preferred = normalized.includes("construction") || normalized.includes("crane")
    ? "Construction"
    : normalized.includes("entrance")
      ? "Blocked Entrance"
      : normalized.includes("tree")
        ? "Tree"
        : normalized.includes("power")
          ? "Power Line"
          : normalized.includes("building")
            ? "Tall Building"
            : normalized.includes("temporary")
              ? "Temporary Blockage"
              : "Other";
  if (availableChoices.includes(preferred)) return preferred;
  if (availableChoices.includes("Other")) return "Other";
  throw new AirtableServiceError(
    "INVALID_RESPONSE",
    '"Obstacle Type" has no writable choice compatible with this hazard.',
  );
}

function fromAirtableRecord(record: z.infer<typeof airtableRecordSchema>): OperationalMemory | null {
  const fields = record.fields;
  const structured = readStructuredMemoryDetails(fields);
  const obstacleNumber = readNumber(fields, ["Obstacle ID"]);
  const id =
    readString(fields, ["memoryId", "Memory_ID", "Memory ID"]) ??
    structured?.memoryId ??
    (obstacleNumber === null ? record.id : `AIRTABLE-OBS-${obstacleNumber}`);
  const hazardType = readString(fields, [
    "hazardType",
    "Obstacle_Type",
    "Hazard Type",
    "Obstacle Type",
  ]);
  const latitude = readNumber(fields, ["latitude", "Latitude"]);
  const longitude = readNumber(fields, ["longitude", "Longitude"]);
  const altitudeMin =
    readNumber(fields, ["altitudeMinM", "Minimum_Altitude", "Altitude Min M"]) ??
    structured?.altitudeBandM[0] ??
    0;
  const altitudeMax =
    readNumber(fields, ["altitudeMaxM", "Maximum_Altitude", "Altitude Max M"]) ??
    structured?.altitudeBandM[1] ??
    200;
  const radiusM =
    readNumber(fields, ["radiusM", "Avoidance_Radius", "Avoidance Radius"]) ??
    structured?.avoidanceRadiusM ??
    50;
  const severity = readSeverity(fields, ["severity", "Severity"]);
  const confidence = readNumber(fields, [
    "confidence",
    "Confidence",
    "Confidence Score",
  ]);
  const routeId =
    readRouteId(fields, ["routeId", "Route_Impacted", "Route Impacted"]) ??
    structured?.routeId ??
    "A";
  const reporter =
    readString(fields, ["sourceDroneId", "Source_Drone", "Source Drone", "Reporter"]) ??
    "Unknown reporter";
  const [reportedDrone, reportedVendor] = reporter.split(" · ", 2);
  const sourceDrone = reportedDrone || reporter;
  const sourceVendor =
    readString(fields, ["sourceVendor", "Source_Vendor", "Source Vendor"]) ??
    structured?.sourceVendor ??
    reportedVendor ??
    "Unknown vendor";
  const sourceMission =
    readString(fields, ["sourceMissionId", "Source_Mission", "Source Mission"]) ??
    structured?.sourceMission ??
    "Airtable record";
  const createdAt =
    readString(fields, [
      "observedAt",
      "Detected_At",
      "Observed At",
      "Last Detected Time",
    ]) ?? new Date().toISOString();
  const expiresAt =
    readString(fields, ["expiresAt", "Expires_At", "Expires At"]) ??
    structured?.expiresAt ??
    new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const status =
    readStatus(fields, ["status", "Status"]) ??
    (readBoolean(fields, ["Active Status"]) === false ? "Inactive" : "Active");
  const summary =
    readDescriptionSummary(fields) ??
    `${hazardType ?? "Obstacle"} affects Route ${routeId}; avoid the recorded radius while active.`;
  const verificationStatus = structured?.verificationStatus;
  const verifiedAt = structured?.verifiedAt;
  const verifiedBy = structured?.verifiedBy;

  if (
    !id ||
    !hazardType ||
    latitude === null ||
    longitude === null ||
    altitudeMin === null ||
    altitudeMax === null ||
    radiusM === null ||
    !severity ||
    confidence === null ||
    !routeId ||
    !sourceDrone ||
    !sourceVendor ||
    !sourceMission ||
    !createdAt ||
    !expiresAt ||
    !status ||
    verificationStatus !== "Human Verified" ||
    !verifiedAt ||
    !verifiedBy
  ) {
    return null;
  }

  return {
    id,
    airtableRecordId: record.id,
    learnedBy: sourceDrone,
    routeId,
    hazardType,
    latitude,
    longitude,
    severity,
    confidence,
    createdAt,
    expiresAt,
    summary,
    altitudeBandM: [altitudeMin, altitudeMax],
    avoidanceRadiusM: radiusM,
    sourceVendor,
    sourceMission,
    status,
    verificationStatus,
    verifiedAt,
    verifiedBy,
    dataSource: "AIRTABLE",
    airtableStatus: "saved",
  };
}

function readString(fields: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function readNumber(fields: Record<string, unknown>, names: string[]): number | null {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readBoolean(
  fields: Record<string, unknown>,
  names: string[],
): boolean | null {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function readStructuredMemoryDetails(
  fields: Record<string, unknown>,
): z.infer<typeof structuredMemoryDetailsSchema> | null {
  const description = readString(fields, ["Description"]);
  if (!description) return null;
  const marker = "DRONE_MEMORY_JSON:";
  const markerIndex = description.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  try {
    const parsed: unknown = JSON.parse(
      description.slice(markerIndex + marker.length).trim(),
    );
    const result = structuredMemoryDetailsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readDescriptionSummary(
  fields: Record<string, unknown>,
): string | null {
  const description = readString(fields, ["Description"]);
  if (!description) return null;
  const summary = description.split("\nDRONE_MEMORY_JSON:", 1)[0]?.trim();
  return summary || null;
}

function readSeverity(fields: Record<string, unknown>, names: string[]): OperationalMemory["severity"] | null {
  const value = readString(fields, names);
  return value === "Low" || value === "Medium" || value === "High" ? value : null;
}

function readRouteId(fields: Record<string, unknown>, names: string[]): OperationalMemory["routeId"] | null {
  const value = readString(fields, names);
  return value === "A" || value === "B" || value === "C" ? value : null;
}

function readStatus(fields: Record<string, unknown>, names: string[]): OperationalMemory["status"] | null {
  const value = readString(fields, names);
  return value === "Active" || value === "Inactive" ? value : null;
}

function isDuplicate(existing: OperationalMemory, incoming: OperationalMemory) {
  const sameType =
    normalizeHazardType(existing.hazardType) ===
    normalizeHazardType(incoming.hazardType);
  const sameLocation = distanceMeters(existing, incoming) <= DUPLICATE_DISTANCE_M;
  const overlappingWindow =
    new Date(existing.createdAt).getTime() < new Date(incoming.expiresAt).getTime() &&
    new Date(existing.expiresAt).getTime() > new Date(incoming.createdAt).getTime();
  return (
    sameType &&
    sameLocation &&
    existing.sourceMission === incoming.sourceMission &&
    overlappingWindow &&
    existing.status === "Active"
  );
}

function normalizeHazardType(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("_", " ");
  return normalized.includes("construction") || normalized.includes("crane")
    ? "construction-crane"
    : normalized;
}

function distanceMeters(
  first: Pick<OperationalMemory, "latitude" | "longitude">,
  second: Pick<OperationalMemory, "latitude" | "longitude">,
) {
  const latScale = 111_320;
  const meanLat = ((first.latitude + second.latitude) / 2) * (Math.PI / 180);
  const lngScale = latScale * Math.cos(meanLat);
  return Math.hypot(
    (first.latitude - second.latitude) * latScale,
    (first.longitude - second.longitude) * lngScale,
  );
}

function handleError(error: unknown): MemoryApiResponse {
  if (error instanceof AirtableServiceError) {
    const sanitizedMessage = sanitizeText(
      error.message,
      process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN,
    );
    console.error(
      "[airtable]",
      JSON.stringify({
        state: error.state,
        upstreamStatus: error.upstream?.statusCode ?? error.statusCode,
        upstreamErrorType: error.upstream?.errorType,
        message: sanitizedMessage,
      }),
    );
    return failure(error.state, sanitizedMessage, error.upstream);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return failure("TIMEOUT", "Airtable request timed out.");
  }
  console.error(
    "[airtable]",
    JSON.stringify({ state: "API_FAILURE", message: "Airtable request failed." }),
  );
  return failure("API_FAILURE", "Airtable request failed.");
}

function failure(
  status: Exclude<MemoryFetchState, "IDLE" | "LOADING" | "SUCCESS" | "SUCCESS_EMPTY">,
  message: string,
  upstream?: SanitizedUpstreamError,
): MemoryApiResponse {
  return { status, memories: [], message, source: "AIRTABLE", upstream };
}

function sanitizeText(value: string, token?: string): string {
  let sanitized = value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  if (token) sanitized = sanitized.replaceAll(token, "[REDACTED]");
  return sanitized.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
}

interface AirtableConfig {
  token: string;
  baseId: string;
  tableName: string;
}

function getConfig(): AirtableConfig | null {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_MEMORY_TABLE_NAME;
  return token && baseId && tableName ? { token, baseId, tableName } : null;
}
