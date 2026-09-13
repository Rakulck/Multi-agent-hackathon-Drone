"use client";

import { makeRouteLegend } from "@/data/demo-routes";
import {
  connectionHealthForFlightMode,
  deriveFlightMode,
  isMemoryActive,
  speedForFlightMode,
  waypointLabel as computeWaypointLabel,
} from "@/lib/mission-machine";
import { MapShell } from "@/components/map/map-shell";
import { LiveDroneState } from "@/components/live-mission/live-drone-state";
import { AgentDecisionPanel } from "@/components/live-mission/agent-decision-panel";
import { IntegrationFlowPanel } from "@/components/live-mission/integration-flow-panel";
import { MemoryCapturePanel } from "@/components/live-mission/memory-capture-panel";
import { HumanInLoopPanel } from "@/components/live-mission/human-in-loop-panel";
import { ConnectionStatusPanel } from "@/components/live-mission/connection-status-panel";
import { cn } from "@/lib/utils";
import type {
  AirspaceEval,
  ApprovalDecision,
  ApprovalRequest,
  ConnectionState,
  FleetDrone,
  FlightMode,
  GeoPoint3D,
  IntegrationEvent,
  MissionMapScene,
  MissionRun,
  MissionState,
  OperationalMemory,
  RouteId,
  RouteStatus,
  StepStatus,
  WeatherEvaluation,
  WeatherSnapshotData,
} from "@/types/domain";

interface LiveMissionTabProps {
  activeMission: MissionRun | null;
  airspaceEval: AirspaceEval | null;
  approval: ApprovalRequest | null;
  commandLog: string[];
  connectionState: ConnectionState;
  currentStatus: MissionState;
  dronePosition: GeoPoint3D;
  etaLabel: string;
  fleet: FleetDrone[];
  flightModeOverride: FlightMode | null;
  hazardVisible: boolean;
  integrationEvents: IntegrationEvent[];
  isRunning: boolean;
  liveBattery: number | null;
  mapScene: MissionMapScene;
  memory: OperationalMemory | null;
  onResolveApproval: (decision: ApprovalDecision) => void;
  onSimulateApproval: () => void;
  onToggleConnection: () => void;
  routeProgress: number;
  routeStatuses: Record<RouteId, RouteStatus>;
  plannedSpeedMph: number | null;
  selectedDrone: string;
  selectedRoute: RouteId | null;
  weather: WeatherSnapshotData | null;
  weatherEvaluation: WeatherEvaluation | null;
}

export function LiveMissionTab({
  activeMission,
  airspaceEval,
  approval,
  commandLog,
  connectionState,
  currentStatus,
  dronePosition,
  etaLabel,
  fleet,
  flightModeOverride,
  hazardVisible,
  integrationEvents,
  isRunning,
  liveBattery,
  mapScene,
  memory,
  onResolveApproval,
  onSimulateApproval,
  onToggleConnection,
  routeProgress,
  routeStatuses,
  plannedSpeedMph,
  selectedDrone,
  selectedRoute,
  weather,
  weatherEvaluation,
}: LiveMissionTabProps) {
  const flightMode = deriveFlightMode({ status: currentStatus, progress: routeProgress, override: flightModeOverride });
  const plannedSpeedKmh = plannedSpeedMph ? Math.round(plannedSpeedMph * 1.60934) : null;
  const speedKmh = flightMode === "CRUISE" || flightMode === "APPROACH" || flightMode === "TAKEOFF" ? (plannedSpeedKmh ?? speedForFlightMode(flightMode)) : speedForFlightMode(flightMode);
  const connectionHealth = connectionHealthForFlightMode(flightMode);
  const routeLegend = makeRouteLegend(routeStatuses, mapScene.routes);
  const waypoint = computeWaypointLabel(mapScene.routes, selectedRoute, routeProgress);
  const activeDrone = fleet.find((drone) => drone.model === selectedDrone);
  const batteryPercent = liveBattery ?? activeDrone?.batteryPercent ?? 0;
  const decision = getLiveDecisionParts(currentStatus, activeMission, memory, approval, flightMode, commandLog[0] ?? null);
  const decisionStatus: StepStatus = approval
    ? "Approval"
    : currentStatus === "OBSTACLE DETECTED"
      ? "Warning"
      : currentStatus === "DELIVERED"
        ? "Completed"
        : currentStatus === "ABORTED"
          ? "Failed"
        : "Evaluating";
  const reroutingBanner = currentStatus === "REROUTING" ? "Rerouting Route A → Route C" : null;
  const showMemory = isMemoryActive(memory) || Boolean(memory && hazardVisible);
  const airspaceVisible = Boolean(airspaceEval);

  return (
    <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,68fr)_minmax(390px,32fr)]">
      <MapShell
        airspaceVisible={airspaceVisible}
        routes={routeLegend}
        routeStatuses={routeStatuses}
        selectedRoute={selectedRoute}
        dronePosition={dronePosition}
        hazardVisible={hazardVisible}
        statusLabel={flightMode}
        dropOffZone={mapScene.dropOffZone}
        reroutingBanner={reroutingBanner}
        selectedDrone={selectedDrone}
        scene={mapScene}
      />

      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="shrink-0 rounded-[22px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Live Mission</p>
              <p className="font-geist mt-0.5 text-lg font-semibold tracking-[-0.03em] text-black">
                {activeMission ? activeMission.replace("_", " ") : "Standby"}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                activeMission ? "bg-black text-white" : "bg-neutral-100 text-neutral-500",
              )}
            >
              {selectedDrone}
            </span>
          </div>
          {weather && weatherEvaluation ? (
            <div className="mt-2 rounded-2xl bg-neutral-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]",
                    weather.dataSource === "LIVE"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700",
                  )}
                >
                  Weather: {weather.dataSource}
                </span>
                <span className="text-[10px] font-bold text-neutral-700">
                  {weatherEvaluation.severity} · {weather.condition}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-medium leading-snug text-neutral-600">
                {weather.windMph} mph wind / {weather.gustMph} mph gust · {weather.windDirectionDeg}° ·{" "}
                {weather.temperatureF}°F · {weather.visibilityMiles} mi visibility
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-black">
                {weatherEvaluation.speedReductionMph > 0
                  ? `Weather adjustment active: ${weatherEvaluation.cruiseSpeedMph} mph, ETA +${weatherEvaluation.etaDeltaMin} min`
                  : `No weather adjustment: ${weatherEvaluation.cruiseSpeedMph} mph planned speed`}
              </p>
            </div>
          ) : null}
        </div>

        <LiveDroneState
          altitudeM={Math.round(dronePosition.altitude)}
          batteryPercent={batteryPercent}
          connectionHealth={connectionHealth}
          etaLabel={etaLabel}
          flightMode={flightMode}
          selectedRoute={selectedRoute}
          speedKmh={speedKmh}
          waypointLabel={waypoint}
        />

        <AgentDecisionPanel
          decision={decision.decision}
          evaluation={decision.evaluation}
          input={decision.input}
          source={decision.source}
          status={decisionStatus}
        />

        <IntegrationFlowPanel events={integrationEvents} />

        {showMemory && memory ? <MemoryCapturePanel hazardCenter={mapScene.hazard.center} memory={memory} /> : null}

        <ConnectionStatusPanel connectionState={connectionState} onToggleConnection={onToggleConnection} />

        <HumanInLoopPanel
          approval={approval}
          isRunning={isRunning}
          onResolveApproval={onResolveApproval}
          onSimulateApproval={onSimulateApproval}
        />
      </aside>
    </section>
  );
}

interface DecisionParts {
  decision: string;
  evaluation: string;
  input: string;
  source: string[];
}

function getLiveDecisionParts(
  status: MissionState,
  activeMission: MissionRun | null,
  memory: OperationalMemory | null,
  approval: ApprovalRequest | null,
  flightMode: FlightMode,
  lastCommand: string | null,
): DecisionParts {
  const commandSuffix = lastCommand ? ` Last command: ${lastCommand}.` : "";

  if (approval) {
    return {
      input: "Secondary object detected near active corridor.",
      evaluation: `${approval.reason}${commandSuffix}`,
      decision: `Human review requested: ${approval.category}. Recommended: ${approval.recommendedAction}`,
      source: approval.transport === "SLACK" ? ["Simulated Sensor", "Slack"] : ["Simulated Sensor", "Agent"],
    };
  }

  if (status === "READY") {
    return {
      input: "No active mission loaded.",
      evaluation: "Mission Planning has not launched an approved plan yet.",
      decision: "Awaiting mission launch.",
      source: ["Agent"],
    };
  }

  if (status === "IN FLIGHT") {
    if (flightMode === "TAKEOFF") {
      return {
        input: "Approved plan loaded on live map.",
        evaluation: "Route locked and preflight conditions clear.",
        decision: `${activeMission === "MISSION_2" ? "CargoSwift" : "Atlas"} lifting off toward the delivery zone.${commandSuffix}`,
        source: ["Agent", "Google Maps 3D"],
      };
    }
    if (flightMode === "APPROACH") {
      return {
        input: "Drone approaching final waypoint.",
        evaluation: "Route corridor clear, drop-off zone in range.",
        decision: `Approaching the drop-off zone.${commandSuffix}`,
        source: ["Agent", "Google Maps 3D"],
      };
    }
    if (flightMode === "DROP-OFF") {
      return {
        input: "Drone within drop-off geofence.",
        evaluation: "Clearance confirmed before release.",
        decision: `Verifying drop-off zone.${commandSuffix}`,
        source: ["Agent"],
      };
    }
    return activeMission === "MISSION_2"
      ? {
          input: "CargoSwift cruising on Route C.",
          evaluation: "Route A was already avoided using shared memory retrieved during preflight.",
          decision: `Cruising toward the delivery zone.${commandSuffix}`,
          source: ["Agent", "Airtable"],
        }
      : {
          input: "Atlas cruising on Route A.",
          evaluation: "Tracking altitude and speed against the approved plan.",
          decision: `Cruising toward the delivery zone.${commandSuffix}`,
          source: ["Agent", "Google Maps 3D"],
        };
  }

  if (status === "OBSTACLE DETECTED") {
    return {
      input: "Object detected inside the active route corridor.",
      evaluation: "Obstacle classified with high confidence. Current corridor intersects its avoidance radius.",
      decision: `HOLD position. Evaluate alternate routes.${commandSuffix}`,
      source: ["Simulated Sensor", "Gemini", "Deterministic Rules"],
    };
  }

  if (status === "MEMORY SAVED") {
    return {
      input: "Verified obstacle record with route, altitude band, confidence, and expiry.",
      evaluation: `${memory?.id ?? "MEM-CRANE-001"} stored for cross-vendor reuse before selecting the alternate corridor.`,
      decision: `Save structured memory and mark Route A blocked.${commandSuffix}`,
      source: ["Airtable", "Agent"],
    };
  }

  if (status === "REROUTING") {
    return {
      input: "Alternate route candidates evaluated.",
      evaluation: `${memory?.id ?? "MEM-CRANE-001"} confirms Route A remains unsafe.`,
      decision: activeMission === "MISSION_2" ? `Changing altitude inside Route C corridor.${commandSuffix}` : `Locking in Route C.${commandSuffix}`,
      source: ["Agent", "Google Maps 3D"],
    };
  }

  if (status === "ABORTED") {
    return {
      input: "Operator rejection received for the blocked drop-off decision.",
      evaluation: `The drone remains stopped at its safe holding point.${commandSuffix}`,
      decision: "Mission aborted. No package release or automatic continuation is permitted.",
      source: ["Slack", "Operator", "Agent"],
    };
  }

  return activeMission === "MISSION_2"
    ? {
        input: "Drone reached the approved drop-off zone.",
        evaluation: "Delivery confirmed using memory learned by Atlas.",
        decision: "Package delivered. Returning to available fleet pool.",
        source: ["Agent"],
      }
    : {
        input: "Drone reached the approved drop-off zone.",
        evaluation: "Delivery confirmed on rerouted corridor.",
        decision: "Package delivered. Returning to available fleet pool.",
        source: ["Agent"],
      };
}
