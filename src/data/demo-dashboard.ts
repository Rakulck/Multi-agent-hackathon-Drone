import type {
  ConnectionIndicator,
  FleetDrone,
  Kpi,
  MemoryPlaceholder,
  MissionIntelligence,
  RouteLegendItem,
  TimelineEvent,
} from "@/types/domain";

export const connectionIndicators: ConnectionIndicator[] = [
  { name: "Maps", status: "placeholder" },
  { name: "Airtable", status: "placeholder" },
  { name: "Slack", status: "placeholder" },
  { name: "Weather", status: "placeholder" },
  { name: "Gemini", status: "placeholder" },
];

export const kpis: Kpi[] = [
  {
    label: "Active mission",
    value: "Standby",
    detail: "Mission loop deferred",
    variant: "empty",
  },
  {
    label: "Available drones",
    value: "3",
    detail: "Mixed-vendor fleet",
    variant: "success",
  },
  {
    label: "Active hazards",
    value: "0",
    detail: "Shared memory pending",
    variant: "warning",
  },
  {
    label: "ETA",
    value: "--",
    detail: "Calculated during mission",
    variant: "loading",
  },
];

export const fleetDrones: FleetDrone[] = [
  {
    id: "atlas-heavylift",
    model: "Atlas HeavyLift",
    vendor: "Atlas Robotics",
    payloadKg: 8,
    rangeKm: 18,
    batteryPercent: 86,
    status: "Available",
    windLimitMph: 25,
  },
  {
    id: "cargoswift-s2",
    model: "CargoSwift S2",
    vendor: "Stratos Aviation",
    payloadKg: 6,
    rangeKm: 24,
    batteryPercent: 92,
    status: "Available",
    windLimitMph: 18,
  },
  {
    id: "minidrop-n3",
    model: "MiniDrop N3",
    vendor: "Nimble Air",
    payloadKg: 2,
    rangeKm: 12,
    batteryPercent: 78,
    status: "Available",
    windLimitMph: 15,
  },
];

export const weatherSnapshotData = {
  windMph: 18,
  gustMph: 21,
  visibilityMiles: 10,
  temperatureF: 64,
  updatedAt: "08:32 AM",
};

export const routeLegend: RouteLegendItem[] = [
  { id: "A", name: "Route A", label: "Primary corridor", status: "candidate" },
  { id: "B", name: "Route B", label: "Courtyard approach", status: "warning" },
  { id: "C", name: "Route C", label: "Memory-safe alternate", status: "selected" },
];

export const missionIntelligence: MissionIntelligence = {
  order: "Grocery payload, 4.5 kg, apartment delivery zone",
  guardrails: [
    "Payload, battery, range, and availability checks will run deterministically.",
    "No autopilot, marketplace, pricing, or customer drone picker behavior.",
    "External integrations remain inactive until server routes are implemented.",
  ],
  selectedDrone: "Pending deterministic evaluation",
  selectedRoute: "Pending route safety check",
  memoryConsulted: "No active shared operational memories in base shell",
  currentStatus: "READY",
};

export const timelineEvents: TimelineEvent[] = [
  {
    time: "00:00",
    title: "Dashboard shell loaded",
    detail: "Mock fleet and mission context are available.",
    variant: "success",
  },
  {
    time: "--:--",
    title: "Mission engine pending",
    detail: "Mission 1 and Mission 2 controls are disabled until the simulation build.",
    variant: "warning",
  },
  {
    time: "--:--",
    title: "Integration events pending",
    detail: "Airtable, Slack, Weather, and Gemini are server-only placeholders.",
    variant: "empty",
  },
];

export const memoryPlaceholder: MemoryPlaceholder = {
  id: "MEM-PENDING",
  title: "Shared operational memory",
  severity: "Medium",
  confidence: "Awaiting simulated observation",
  expires: "Not scheduled",
  detail:
    "Mission-learning behavior is intentionally left for the judged hackathon build.",
};
