export type ConnectionName =
  | "Maps"
  | "Airtable"
  | "Slack"
  | "Twilio"
  | "Weather"
  | "Gemini";

export type ConnectionStatus = "placeholder" | "connected" | "warning" | "error";

export type DroneStatus = "Available" | "Charging" | "In Mission" | "Maintenance";

export type VisualVariant = "loading" | "empty" | "success" | "warning" | "error";

export type MissionRun = "MISSION_1" | "MISSION_2";

export type MissionState =
  | "READY"
  | "ANALYZING ORDER"
  | "SELECTING DRONE"
  | "CHECKING CONDITIONS"
  | "IN FLIGHT"
  | "OBSTACLE DETECTED"
  | "MEMORY SAVED"
  | "REROUTING"
  | "RETURNING_HOME"
  | "DELIVERED"
  | "ABORTED";

export type RouteId = "A" | "B" | "C";

export type RouteStatus = "candidate" | "selected" | "warning" | "blocked";

export interface ConnectionIndicator {
  name: ConnectionName;
  status: ConnectionStatus;
}

export interface Kpi {
  label: string;
  value: string;
  detail: string;
  variant: VisualVariant;
}

export interface FleetDrone {
  id: string;
  model: string;
  vendor: string;
  payloadKg: number;
  rangeKm: number;
  batteryPercent: number;
  status: DroneStatus;
  windLimitMph: number;
}

export interface RouteLegendItem {
  id: RouteId;
  name: "Route A" | "Route B" | "Route C";
  label: string;
  status: RouteStatus;
}

export interface TimelineEvent {
  id?: string;
  time: string;
  title: string;
  detail: string;
  variant: VisualVariant;
}

export interface MissionIntelligence {
  order: string;
  guardrails: string[];
  selectedDrone: string;
  selectedRoute: string;
  memoryConsulted: string;
  currentStatus: MissionState;
}

export interface MemoryPlaceholder {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  confidence: string;
  expires: string;
  detail: string;
}

export interface GeoPoint3D {
  lat: number;
  lng: number;
  altitude: number;
}

export interface DemoRoute {
  id: RouteId;
  name: RouteLegendItem["name"];
  label: string;
  waypoints: GeoPoint3D[];
}

export interface HazardZone {
  id: string;
  label: string;
  center: GeoPoint3D;
  polygon: GeoPoint3D[];
}

export interface OperationalMemory {
  id: string;
  airtableRecordId?: string;
  learnedBy: string;
  usedBy?: string;
  routeId: RouteId;
  hazardType: string;
  latitude: number;
  longitude: number;
  severity: "Low" | "Medium" | "High";
  confidence: number;
  createdAt: string;
  expiresAt: string;
  summary: string;
  altitudeBandM: [number, number];
  avoidanceRadiusM: number;
  sourceVendor: string;
  sourceMission: string;
  status: "Active" | "Inactive";
  verificationStatus: "Awaiting Verification" | "Human Verified";
  verifiedAt?: string;
  verifiedBy?: string;
  dataSource: MemoryDataSource;
  airtableStatus: "draft" | "saving" | "saved" | "failed" | "fallback";
}

export type MemoryDataSource = "AIRTABLE" | "DEMO_FALLBACK";

export type MemoryMode = "AIRTABLE" | "DEMO_FALLBACK";

export type MemoryFetchState =
  | "IDLE"
  | "LOADING"
  | "SUCCESS"
  | "SUCCESS_EMPTY"
  | "TIMEOUT"
  | "MISSING_KEY"
  | "INVALID_RESPONSE"
  | "API_FAILURE";

export interface MemoryApiResponse {
  status: Exclude<MemoryFetchState, "IDLE" | "LOADING">;
  memories: OperationalMemory[];
  message: string;
  source: MemoryDataSource;
  duplicate?: boolean;
  airtableRecordId?: string;
  presetIsolation?: boolean;
  upstream?: {
    statusCode: number;
    errorType?: string;
    message: string;
  };
}

export interface MemoryRouteMatch {
  memoryId: string;
  routeId: RouteId;
  distanceM: number;
  altitudeOverlap: boolean;
  matched: boolean;
  reason: string;
}

/** Top-level product surfaces. */
export type TopTab = "planning" | "airtable" | "live";

/** High-level flight modes surfaced on the Live Mission tab. */
export type FlightMode =
  | "TAKEOFF"
  | "CRUISE"
  | "HOLD"
  | "EVALUATING"
  | "REROUTING"
  | "APPROACH"
  | "DROP-OFF"
  | "RETURNING"
  | "DELIVERED";

export type ConnectionHealth = "Nominal" | "Degraded";

export type ApprovalCategory =
  | "Low-confidence obstacle"
  | "All routes blocked"
  | "Borderline weather"
  | "Uncertain battery reserve"
  | "Blocked drop-off zone"
  | "Missing safety data"
  | "Mission caution review"
  | "Live obstacle reroute";

export interface ApprovalRequest {
  category: ApprovalCategory;
  reason: string;
  recommendedAction: string;
  requestId: string | null;
  status: SlackApprovalStatus;
  transport: ApprovalTransport;
  missionId?: string;
  droneName?: string;
  proposedAlternative?: string;
  routeImpact?: string;
  expiresAt?: string;
  operatorName?: string;
  statusMessage?: string;
  risks?: MissionRiskCondition[];
  approvalKind?: SlackApprovalKind;
}

export type ApprovalDecision = "approve" | "hold" | "reject";
export type LiveObstacleMitigation =
  | "ADJUST_ALTITUDE"
  | "CHOOSE_ALTERNATE_ROUTE";

export type ApprovalTransport = "SLACK" | "DEMO_FALLBACK";

export type SlackApprovalStatus =
  | "SENDING"
  | "PENDING"
  | "APPROVED"
  | "HELD"
  | "REJECTED"
  | "TIMED_OUT"
  | "SLACK_UNAVAILABLE"
  | "SLACK_API_FAILED"
  | "SLACK_UPDATE_FAILED";

export interface SlackApprovalApiResponse {
  requestId: string;
  status: SlackApprovalStatus;
  transport: ApprovalTransport;
  missionId: string;
  createdAt: string;
  expiresAt: string;
  operatorName?: string;
  statusMessage: string;
  duplicate: boolean;
  memory?: OperationalMemory;
  memoryWriteStatus?: "NOT_REQUIRED" | "PENDING" | "SAVED" | "FAILED";
  mitigation?: LiveObstacleMitigation;
}

export type SlackApprovalKind = "GENERAL_CAUTION" | "LIVE_OBSTACLE_REROUTE";

export type MissionDecisionLevel = "SAFE" | "CAUTION" | "UNSAFE";

export type MissionRiskKind =
  | "WEATHER_MARGIN"
  | "BATTERY_RESERVE"
  | "OBSTACLE_CONFIDENCE"
  | "AIRSPACE_PROXIMITY"
  | "ROUTE_ADJUSTMENT"
  | "DELIVERY_ZONE"
  | "HARD_SAFETY_LIMIT";

export interface MissionRiskCondition {
  id: string;
  kind: MissionRiskKind;
  level: Exclude<MissionDecisionLevel, "SAFE">;
  riskDetected: string;
  currentValue: string;
  allowedLimit: string;
  agentRecommendation: string;
  proposedAdjustment: string;
}

export interface MissionRiskReview {
  level: MissionDecisionLevel;
  conditions: MissionRiskCondition[];
  summary: string;
}

export interface DropOffZone {
  id: string;
  label: string;
  point: GeoPoint3D;
}

/** External applications surfaced in the Live Mission "Integration Flow" panel. */
export type IntegrationApp =
  | "Drone Sensor"
  | "OpenWeather"
  | "Mission Agent"
  | "Twilio"
  | "Customer"
  | "Gemini 2.5 Flash"
  | "Deterministic Safety Engine"
  | "Airtable"
  | "Route Updated"
  | "Google Maps 3D"
  | "Slack"
  | "Operator";

export type IntegrationStatus = "Waiting" | "Processing" | "Completed" | "Failed";

export interface IntegrationEvent {
  id: string;
  app: IntegrationApp;
  result: string;
  status: IntegrationStatus;
  timestamp: string;
}

export type CustomerMessageEventType =
  | "DISPATCHED_TO_PICKUP"
  | "PACKAGE_PICKED_UP"
  | "APPROACHING_DESTINATION"
  | "ALTERNATE_DROPOFF_REQUIRED"
  | "DELIVERED";

export type CustomerMessageStatus = "queued" | "sent" | "delivered" | "failed";

export type CustomerCommunicationTransport = "TWILIO" | "DEMO_FALLBACK";

export interface CustomerMessageEvent {
  eventType: CustomerMessageEventType;
  messageSid: string | null;
  status: CustomerMessageStatus;
  timestamp: string;
  transport: CustomerCommunicationTransport;
  errorCode?: string;
}

export interface CustomerCommunicationSnapshot {
  missionId: string;
  recipientMasked: string;
  transport: CustomerCommunicationTransport;
  events: CustomerMessageEvent[];
  waitingForReply: boolean;
  replyReceived: boolean;
  selectedAlternative: "Terrace" | "Front Entrance" | null;
  safetyValidation: "PENDING" | "SAFE" | "UNSAFE" | null;
  safetyReason: string | null;
  updatedDropOff: "Terrace" | "Front Entrance" | null;
  operatorReviewRequested: boolean;
  updatedAt: string;
}

export type GeminiAnalysisMode = "LIVE" | "DEMO_FALLBACK";

export type GeminiAnalysisStatus =
  | "SUCCESS"
  | "GEMINI_API_FAILURE"
  | "INVALID_REQUEST";

export type GeminiObservationSource = "GEMINI" | "DEMO_FALLBACK";

export interface GeminiObstacleObservation {
  obstacleDetected: boolean;
  obstacleType: "CONSTRUCTION_CRANE";
  description: string;
  confidence: number;
  estimatedCoordinates: {
    latitude: number;
    longitude: number;
  };
  minimumAltitudeM: number;
  maximumAltitudeM: number;
  recommendedMemoryTtlMinutes: number;
}

export type ObstacleSafetyAction =
  | "CONTINUE"
  | "REROUTE"
  | "HOLD_FOR_HUMAN_REVIEW"
  | "GEMINI_API_FAILURE";

export interface ObstacleSafetyDecision {
  action: ObstacleSafetyAction;
  reason: string;
  affectedRoute: RouteId | null;
  routeOverlap: boolean;
  altitudeOverlap: boolean;
  relevantForMemory: boolean;
}

export type VisionAnalysisPhase =
  | "IDLE"
  | "ANALYZING"
  | "COMPLETE"
  | "FAILED";

export type VisionMemorySaveStatus =
  | "NOT_APPLICABLE"
  | "AWAITING_APPROVAL"
  | "SAVED"
  | "DUPLICATE"
  | "FAILED"
  | "DEMO_FALLBACK_PENDING";

export interface GeminiObstacleApiResponse {
  status: GeminiAnalysisStatus;
  source: GeminiObservationSource | null;
  model: string;
  message: string;
  latencyMs: number;
  schemaValidation: boolean;
  observation: GeminiObstacleObservation | null;
  decision: ObstacleSafetyDecision;
  memory: OperationalMemory | null;
  memorySaveStatus: VisionMemorySaveStatus;
  memorySaveMessage: string;
}

/* -------------------------------------------------------------------------- */
/* Multi-mission preflight model                                              */
/* -------------------------------------------------------------------------- */

export type DeliveryType = "Grocery" | "Medical" | "Small Logistics";

export type MissionPriority = "Standard" | "Express" | "Critical";

export type DropOffPreference = "Primary entrance" | "Rooftop" | "Courtyard";

/** A geocoded real-world address resolved via the Google Maps Geocoding API. */
export interface GeoAddress {
  label: string;
  lat: number;
  lng: number;
}

export interface NewMissionInput {
  customerName?: string;
  deliveryType: DeliveryType;
  weightKg: number;
  pickup: string;
  drop: string;
  priority: MissionPriority;
  dropOffPreference: DropOffPreference;
  /** A custom number is used only during server registration and then removed from client mission state. */
  recipientPhone?: string;
  recipientPhoneMasked?: string;
  useDemoRecipient: boolean;
  /** Set once the `pickup` text has been geocoded to a real coordinate. */
  pickupPlace?: GeoAddress;
  /** Set once the `drop` text has been geocoded to a real coordinate. */
  dropPlace?: GeoAddress;
}

/**
 * The full set of geographic entities the 3D map renders for one mission —
 * origin/destination, the three route corridors, the hazard geofence,
 * FAA-constrained airspace overlays, and the drop-off zones. When a mission
 * supplies real geocoded pickup/drop addresses this is generated by warping
 * the tuned demo geometry onto the new origin/destination pair; otherwise
 * it's the original fixed demo scene.
 */
/** Map overlay geometry for the Airspace Compliance step. */
export interface AirspaceMapOverlay {
  restrictedPolygons: GeoPoint3D[][];
  permittedCorridor: GeoPoint3D[];
  altitudeCeilingAnchor: GeoPoint3D;
  maxAltitudeAglFt: number;
  authorizationRequired: boolean;
  corridorLabel: string;
}

export interface MissionMapScene {
  origin: GeoPoint3D;
  destination: GeoPoint3D;
  originLabel: string;
  destinationLabel: string;
  routes: DemoRoute[];
  hazard: HazardZone;
  secondObstacle: GeoPoint3D;
  dropOffZone: DropOffZone;
  alternateDropOffA: GeoPoint3D;
  alternateDropOffB: GeoPoint3D;
  isCustomAddress: boolean;
  airspace: AirspaceMapOverlay;
}

export type MissionLifecycle =
  | "NEW"
  | "PREFLIGHT"
  | "HOLD"
  | "READY"
  | "LAUNCHED"
  | "IN_FLIGHT"
  | "RETURNING_HOME"
  | "DELIVERED"
  | "ABORTED";

export const preflightStepOrder = [
  "REQUEST",
  "FLEET",
  "WEATHER",
  "AIRSPACE",
  "MEMORY",
  "ROUTES",
  "APPROVAL",
  "READY",
] as const;

export type PreflightStepId = (typeof preflightStepOrder)[number];

export type StepStatus = "Waiting" | "Evaluating" | "Completed" | "Warning" | "Failed" | "Approval";

export interface StepEvidence {
  id: PreflightStepId;
  title: string;
  input: string[];
  evaluation: string[];
  decision: string;
  source: string[];
  status: StepStatus;
  summary: string;
}

export interface FleetEvalRow {
  drone: FleetDrone;
  eligible: boolean;
  reason: string;
}

export interface RouteEvalRow {
  id: RouteId;
  name: string;
  distanceKm: number;
  etaMin: number;
  weatherExposure: string;
  memoryConflict: string;
  status: RouteStatus;
  reason: string;
}

export interface WeatherSnapshotData {
  windMph: number;
  gustMph: number;
  windDirectionDeg: number;
  visibilityMiles: number;
  temperatureF: number;
  condition: string;
  updatedAt: string;
  dataSource: WeatherDataSource;
  locations: {
    pickup: WeatherLocationSnapshot;
    dropOff: WeatherLocationSnapshot;
  };
}

export type WeatherDataSource = "LIVE" | "DEMO_FALLBACK";

export type WeatherMode = "LIVE" | "SAFE" | "MODERATE" | "UNSAFE";

export type WeatherFetchState =
  | "IDLE"
  | "LOADING"
  | "SUCCESS"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "MISSING_API_KEY"
  | "RATE_LIMIT"
  | "API_FAILURE";

export interface WeatherLocationSnapshot {
  label: "Pickup" | "Drop-off";
  windMph: number;
  gustMph: number;
  windDirectionDeg: number;
  visibilityMiles: number;
  temperatureF: number;
  condition: string;
  timestamp: string;
}

export interface WeatherResponse {
  status: Exclude<WeatherFetchState, "IDLE" | "LOADING">;
  weather: WeatherSnapshotData;
  message: string;
}

export interface WeatherDroneEvaluation {
  drone: FleetDrone;
  accepted: boolean;
  utilizationPercent: number;
  reason: string;
}

export interface WeatherEvaluation {
  droneEvaluations: WeatherDroneEvaluation[];
  confirmedDrone: FleetDrone | null;
  severity: "SAFE" | "MODERATE" | "UNSAFE";
  cruiseSpeedMph: number | null;
  speedReductionMph: number;
  etaDeltaMin: number;
  paused: boolean;
  reason: string;
}

export type AirspaceClass = "Controlled" | "Uncontrolled";

export interface AirspaceRestriction {
  id: string;
  label: string;
  type: "TFR" | "NOTAM" | "Geofence";
  active: boolean;
  detail: string;
}

export interface AirspaceRouteResult {
  id: RouteId;
  name: string;
  eligible: boolean;
  plannedAglFt: number;
  reason: string;
}

/**
 * Deterministic airspace compliance snapshot produced during preflight.
 * LAANC fields are mock-labeled unless a real authorization exists.
 */
export interface AirspaceEval {
  airspaceClass: AirspaceClass;
  maxAltitudeAglFt: number;
  authorizationRequired: boolean;
  /** Always false in MVP — no real LAANC authorization is obtained. */
  laancAuthorized: boolean;
  restrictions: AirspaceRestriction[];
  routeResults: AirspaceRouteResult[];
  preferredRoute: RouteId;
  dataSource: string;
  timestamp: string;
  facilityMapGrid: string;
  decision: string;
}

export interface ApprovedPlan {
  version: 1 | 2;
  droneModel: string;
  routeId: RouteId;
  speedMph: number;
  altitudeCorridor: string;
  batteryReserve: string;
  primaryDropOff: string;
  backupDropOff: string;
  memoriesUsed: string[];
  weatherTimestamp: string;
  approvalStatus: string;
}

export interface Mission {
  id: string;
  label: string;
  createdAt: string;
  input: NewMissionInput;
  lifecycle: MissionLifecycle;
  pattern: MissionRun;
  isDemoPreset: boolean;
  steps: Record<PreflightStepId, StepEvidence>;
  activeStepId: PreflightStepId | null;
  fleetEligibility: FleetEvalRow[] | null;
  provisionalDrone: string | null;
  confirmedDrone: string | null;
  weatherMode: WeatherMode;
  weatherFetchState: WeatherFetchState;
  weatherFetchMessage: string | null;
  weather: WeatherSnapshotData | null;
  weatherEvaluation: WeatherEvaluation | null;
  weatherApprovalGranted: boolean;
  memoryMode: MemoryMode;
  memoryFetchState: MemoryFetchState;
  memoryFetchMessage: string | null;
  memories: OperationalMemory[];
  memoryMatches: MemoryRouteMatch[];
  cruiseSpeedMph: number | null;
  etaDeltaMin: number;
  routeEval: RouteEvalRow[] | null;
  selectedRoute: RouteId | null;
  airspaceEval: AirspaceEval | null;
  riskReview: MissionRiskReview | null;
  approvalRequired: boolean;
  plan: ApprovedPlan | null;
  mapScene: MissionMapScene;
  customerCommunication: CustomerCommunicationSnapshot | null;
}

export type ConnectionState = "online" | "offline";
