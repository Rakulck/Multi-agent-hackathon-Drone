"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Database, Radio, type LucideIcon } from "lucide-react";
import { dispatchOrigin } from "@/data/demo-routes";
import { MissionPlanningTab } from "@/components/dashboard/mission-planning-tab";
import { NewMissionModal } from "@/components/dashboard/new-mission-modal";
import { LiveMissionTab } from "@/components/live-mission/live-mission-tab";
import {
  BASE_CRUISE_SPEED_MPH,
  appendIntegrationEvent,
  buildAirspaceStepEvidence,
  buildApprovalStepEvidence,
  buildApprovedPlan,
  buildFleetStepEvidence,
  buildMemoryStepEvidence,
  buildReadyStepEvidence,
  buildRequestStepEvidence,
  buildRoutesStepEvidence,
  buildWeatherStepEvidence,
  createCraneMemory,
  createMission,
  defaultWeatherSnapshot,
  evaluateAirspaceForMission,
  evaluateFleetForMission,
  evaluateRoutesForMission,
  evaluateWeatherForDrones,
  fleetSnapshotForPreflight,
  interpolateRoute,
  isApprovalRequired,
  isMemoryActive,
  makeInitialFleet,
  makeInitialRouteStatuses,
  markMemorySaved,
  markMemoryUsed,
  memoryStorageKey,
  pickProvisionalDrone,
  resetMissionCounter,
  settleLastIntegrationEvent,
} from "@/lib/mission-machine";
import { defaultMapScene } from "@/lib/map/route-warp";
import { cn } from "@/lib/utils";
import {
  preflightStepOrder,
  type ApprovalDecision,
  type ApprovalRequest,
  type DemoRoute,
  type FleetDrone,
  type FlightMode,
  type GeoPoint3D,
  type IntegrationEvent,
  type Mission,
  type MissionMapScene,
  type MissionRun,
  type MissionState,
  type NewMissionInput,
  type OperationalMemory,
  type PreflightStepId,
  type RouteId,
  type RouteStatus,
  type StepEvidence,
  type TopTab,
} from "@/types/domain";

const liveEnabledLifecycles: Mission["lifecycle"][] = ["READY", "LAUNCHED", "IN_FLIGHT", "DELIVERED"];

export function DashboardShell() {
  const [topTab, setTopTab] = useState<TopTab>("planning");
  // The Live Mission map is expensive to create (real Google Maps 3D scene).
  // Mount it lazily on first visit, then keep it mounted (just hidden) so the
  // scene and animation state survive further tab switches.
  const [hasVisitedLive, setHasVisitedLive] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [showNewMissionModal, setShowNewMissionModal] = useState(false);
  const [isRunningPreflight, setIsRunningPreflight] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const [fleet, setFleet] = useState<FleetDrone[]>(() => makeInitialFleet());
  const [routeStatuses, setRouteStatuses] = useState<Record<RouteId, RouteStatus>>(() => makeInitialRouteStatuses());
  const [currentStatus, setCurrentStatus] = useState<MissionState>("READY");
  const [activeMission, setActiveMission] = useState<MissionRun | null>(null);
  const [activeMapScene, setActiveMapScene] = useState<MissionMapScene>(defaultMapScene);
  const [selectedDrone, setSelectedDrone] = useState("Pending");
  const [selectedRoute, setSelectedRoute] = useState<RouteId | null>(null);
  const [memory, setMemory] = useState<OperationalMemory | null>(null);
  const [hazardVisible, setHazardVisible] = useState(false);
  const [dronePosition, setDronePosition] = useState<GeoPoint3D>(dispatchOrigin);
  const [routeProgress, setRouteProgress] = useState(0);
  const [liveBattery, setLiveBattery] = useState<number | null>(null);
  const [etaLabel, setEtaLabel] = useState("--");
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [flightModeOverride, setFlightModeOverride] = useState<FlightMode | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [slackNotified, setSlackNotified] = useState(false);
  const [integrationEvents, setIntegrationEvents] = useState<IntegrationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<"online" | "offline">("online");

  useEffect(() => {
    let restoreTimer: number | undefined;
    const saved = window.localStorage.getItem(memoryStorageKey);

    if (!saved) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(saved) as OperationalMemory;

      if (isMemoryActive(parsed)) {
        restoreTimer = window.setTimeout(() => {
          setMemory({ ...parsed, airtableStatus: "saved" });
          setHazardVisible(true);
        }, 0);
      }
    } catch {
      window.localStorage.removeItem(memoryStorageKey);
    }

    return () => {
      if (restoreTimer) {
        window.clearTimeout(restoreTimer);
      }
    };
  }, []);

  const selectedMission = missions.find((mission) => mission.id === selectedMissionId) ?? null;
  const liveEnabled = Boolean(selectedMission && liveEnabledLifecycles.includes(selectedMission.lifecycle));

  function updateMission(missionId: string, updater: (mission: Mission) => Mission) {
    setMissions((current) => current.map((mission) => (mission.id === missionId ? updater(mission) : mission)));
  }

  function pushIntegrationEvent(app: IntegrationEvent["app"], result: string, status: IntegrationEvent["status"] = "Processing") {
    setIntegrationEvents((current) => appendIntegrationEvent(current, app, result, status));
  }

  function settleIntegrationFlow() {
    setIntegrationEvents((current) => settleLastIntegrationEvent(current));
  }

  function pushCommand(command: string) {
    setCommandLog((current) => [command, ...current].slice(0, 5));
  }

  function handleCreateMission(input: NewMissionInput) {
    const mission = createMission(input);
    setMissions((current) => [...current, mission]);
    setSelectedMissionId(mission.id);
    setShowNewMissionModal(false);
  }

  async function runStep(missionId: string, stepId: PreflightStepId, compute: () => StepEvidence) {
    updateMission(missionId, (mission) => ({
      ...mission,
      activeStepId: stepId,
      steps: { ...mission.steps, [stepId]: { ...mission.steps[stepId], status: "Evaluating" } },
    }));
    await wait(420);
    const evidence = compute();
    updateMission(missionId, (mission) => ({ ...mission, steps: { ...mission.steps, [stepId]: evidence } }));
    await wait(620);
  }

  async function advancePreflightStep(missionId: string) {
    if (isRunningPreflight) {
      return;
    }

    const mission = missions.find((candidate) => candidate.id === missionId);

    if (!mission || (mission.lifecycle !== "NEW" && mission.lifecycle !== "PREFLIGHT")) {
      return;
    }

    const nextStepId = preflightStepOrder.find((id) => mission.steps[id].status === "Waiting");

    if (!nextStepId) {
      return;
    }

    setIsRunningPreflight(true);

    if (mission.lifecycle === "NEW") {
      updateMission(missionId, (current) => ({ ...current, lifecycle: "PREFLIGHT" }));
    }

    switch (nextStepId) {
      case "REQUEST": {
        await runStep(missionId, "REQUEST", () => buildRequestStepEvidence(mission.input));
        break;
      }
      case "FLEET": {
        const fleetSnapshot = fleetSnapshotForPreflight(fleet, memory);
        const fleetRows = evaluateFleetForMission(fleetSnapshot, mission.input.weightKg, mission.input.deliveryType);
        const provisional = pickProvisionalDrone(fleetRows);
        await runStep(missionId, "FLEET", () => buildFleetStepEvidence(fleetRows, mission.input.weightKg));
        updateMission(missionId, (current) => ({
          ...current,
          fleetEligibility: fleetRows,
          provisionalDrone: provisional?.drone.model ?? null,
        }));
        break;
      }
      case "WEATHER": {
        const fleetRows = mission.fleetEligibility ?? [];
        const weatherResult = evaluateWeatherForDrones(fleetRows, defaultWeatherSnapshot);
        await runStep(missionId, "WEATHER", () => buildWeatherStepEvidence({ weather: defaultWeatherSnapshot, ...weatherResult }));
        updateMission(missionId, (current) => ({
          ...current,
          confirmedDrone: weatherResult.confirmed?.model ?? null,
          cruiseSpeedMph: weatherResult.cruiseSpeedMph,
          etaDeltaMin: weatherResult.etaDeltaMin,
        }));
        break;
      }
      case "AIRSPACE": {
        const airspaceEval = evaluateAirspaceForMission();
        await runStep(missionId, "AIRSPACE", () => buildAirspaceStepEvidence(airspaceEval));
        updateMission(missionId, (current) => ({
          ...current,
          airspaceEval,
          selectedRoute: airspaceEval.preferredRoute,
        }));
        break;
      }
      case "MEMORY": {
        const memoryActive = isMemoryActive(memory);
        await runStep(missionId, "MEMORY", () => buildMemoryStepEvidence(memory));
        updateMission(missionId, (current) => ({ ...current, pattern: memoryActive ? "MISSION_2" : "MISSION_1" }));
        break;
      }
      case "ROUTES": {
        const memoryActive = mission.pattern === "MISSION_2" || isMemoryActive(memory);
        const routesResult = evaluateRoutesForMission(memoryActive, mission.airspaceEval);
        const airspaceBlocksRouteA = Boolean(
          mission.airspaceEval && !mission.airspaceEval.routeResults.find((row) => row.id === "A")?.eligible,
        );
        await runStep(missionId, "ROUTES", () =>
          buildRoutesStepEvidence({
            rows: routesResult.rows,
            selectedRoute: routesResult.selectedRoute,
            droneModel: mission.confirmedDrone,
            memoryBlocksRouteA: memoryActive,
            airspaceBlocksRouteA,
          }),
        );
        updateMission(missionId, (current) => ({
          ...current,
          routeEval: routesResult.rows,
          selectedRoute: routesResult.selectedRoute,
        }));
        break;
      }
      case "APPROVAL": {
        const approvalRequired = isApprovalRequired(mission.routeEval);
        await runStep(missionId, "APPROVAL", () => buildApprovalStepEvidence(approvalRequired));
        updateMission(missionId, (current) => ({ ...current, approvalRequired }));

        if (approvalRequired) {
          updateMission(missionId, (current) => ({ ...current, lifecycle: "HOLD" }));
        }
        break;
      }
      case "READY": {
        const memoryActive = mission.pattern === "MISSION_2";
        const plan = buildApprovedPlan({
          version: 1,
          droneModel: mission.confirmedDrone ?? "Unassigned",
          routeId: mission.selectedRoute ?? "A",
          speedMph: mission.cruiseSpeedMph ?? BASE_CRUISE_SPEED_MPH,
          primaryDropOff: `${mission.input.dropOffPreference} Zone A`,
          backupDropOff: memoryActive ? "Alternate courtyard Zone B" : "Route C fallback zone",
          memoriesUsed: memoryActive && memory ? [memory.id] : [],
          weatherTimestamp: defaultWeatherSnapshot.updatedAt,
          approvalStatus: "Autonomous launch approved",
        });
        await runStep(missionId, "READY", () => buildReadyStepEvidence(plan));
        updateMission(missionId, (current) => ({ ...current, plan, lifecycle: "READY" }));
        break;
      }
      default:
        break;
    }

    setIsRunningPreflight(false);
  }

  function handleRunPreflight() {
    if (!selectedMission) {
      return;
    }
    void advancePreflightStep(selectedMission.id);
  }

  function handleNextStep() {
    if (!selectedMission) {
      return;
    }
    void advancePreflightStep(selectedMission.id);
  }

  function handleLaunchMission() {
    if (!selectedMission || selectedMission.lifecycle !== "READY" || isLaunching) {
      return;
    }
    void launchMission(selectedMission);
  }

  async function launchMission(mission: Mission) {
    setIsLaunching(true);
    setApproval(null);
    setFlightModeOverride(null);
    setSlackNotified(false);
    setCommandLog([]);
    setIntegrationEvents([]);
    setConnectionState("online");
    updateMission(mission.id, (current) => ({ ...current, lifecycle: "LAUNCHED" }));
    setActiveMission(mission.pattern);
    setActiveMapScene(mission.mapScene);
    setTopTab("live");
    setHasVisitedLive(true);
    setDronePosition(mission.mapScene.origin);
    setRouteProgress(0);
    setSelectedDrone(mission.confirmedDrone ?? "Pending");
    setSelectedRoute(mission.selectedRoute);
    setLiveBattery(fleet.find((drone) => drone.model === mission.confirmedDrone)?.batteryPercent ?? null);
    setFleet((current) => current.map((drone) => (drone.model === mission.confirmedDrone ? { ...drone, status: "In Mission" } : drone)));
    setRouteStatuses(routeStatusesFromEval(mission));
    setCurrentStatus("IN FLIGHT");
    setEtaLabel(mission.plan ? `${Math.round(routeEtaMinutes(mission.selectedRoute) )} min` : "Calculating");
    pushIntegrationEvent("Agent", "Approved plan loaded onto live map");

    if (mission.pattern === "MISSION_1") {
      await runLiveMission1(mission);
    } else {
      await runLiveMission2(mission);
    }

    updateMission(mission.id, (current) => ({ ...current, lifecycle: "DELIVERED" }));
    setIsLaunching(false);
  }

  async function runLiveMission1(mission: Mission) {
    const droneModel = mission.confirmedDrone ?? "Atlas HeavyLift";
    const routes = mission.mapScene.routes;
    const flightRoute: RouteId = mission.selectedRoute ?? "B";

    await wait(500);
    await animateRoute(routes, flightRoute, 0, 0.58, 2400, setDronePosition, setRouteProgress);

    setCurrentStatus("OBSTACLE DETECTED");
    setHazardVisible(true);
    setRouteStatuses({ A: "blocked", B: flightRoute === "B" ? "selected" : "candidate", C: flightRoute === "C" ? "selected" : "candidate" });
    setLiveBattery((current) => (current === null ? null : current - 2));
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Gemini", "Construction crane classified at 92% confidence");

    await wait(500);
    const newMemory = createCraneMemory();
    setMemory(newMemory);
    window.localStorage.setItem(memoryStorageKey, JSON.stringify(newMemory));
    pushCommand("Reject Route A");
    pushIntegrationEvent("Airtable", `Obstacle memory ${newMemory.id} saved`);

    await wait(500);
    const savedMemory = markMemorySaved(newMemory);
    setMemory(savedMemory);
    window.localStorage.setItem(memoryStorageKey, JSON.stringify(savedMemory));

    // Airspace already kept the aircraft off Route A; continue on the approved candidate corridor.
    if (flightRoute === "A") {
      await wait(450);
      setCurrentStatus("REROUTING");
      setSelectedRoute("C");
      setRouteStatuses({ A: "blocked", B: "candidate", C: "selected" });
      setEtaLabel("3 min");
      pushCommand("Select Route C");
      pushIntegrationEvent("Google Maps 3D", "Route A blocked, Route C rendered");

      await wait(500);
      pushCommand("Resume flight");
      setCurrentStatus("IN FLIGHT");
      setLiveBattery((current) => (current === null ? null : current - 4));
      await animateRoute(routes, "C", 0.24, 1, 2600, setDronePosition, setRouteProgress);
    } else {
      await wait(450);
      pushCommand(`Resume flight on Route ${flightRoute}`);
      setCurrentStatus("IN FLIGHT");
      setSelectedRoute(flightRoute);
      setRouteStatuses({ A: "blocked", B: flightRoute === "B" ? "selected" : "candidate", C: flightRoute === "C" ? "selected" : "candidate" });
      setEtaLabel("3 min");
      pushIntegrationEvent("Google Maps 3D", `Route A blocked in memory; continuing Route ${flightRoute}`);
      setLiveBattery((current) => (current === null ? null : current - 4));
      await animateRoute(routes, flightRoute, 0.58, 1, 2200, setDronePosition, setRouteProgress);
    }

    pushCommand("Verify drop-off zone");
    await wait(450);
    setCurrentStatus("DELIVERED");
    setEtaLabel("Delivered");
    setFleet((current) => current.map((drone) => (drone.model === droneModel ? { ...drone, status: "Available" } : drone)));
    settleIntegrationFlow();
  }

  async function runLiveMission2(mission: Mission) {
    const droneModel = mission.confirmedDrone ?? "CargoSwift S2";
    const routes = mission.mapScene.routes;

    pushIntegrationEvent("Airtable", "Crane memory retrieved before takeoff");
    if (memory) {
      const usedMemory = markMemoryUsed(memory, droneModel);
      setMemory(usedMemory);
      window.localStorage.setItem(memoryStorageKey, JSON.stringify(usedMemory));
    }

    await wait(500);
    await animateRoute(routes, "C", 0, 0.42, 2200, setDronePosition, setRouteProgress);

    setCurrentStatus("OBSTACLE DETECTED");
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Gemini", "Temporary altitude obstacle classified");

    await wait(500);
    pushCommand("Evaluate altitude corridors");
    pushIntegrationEvent("Agent", "Verified clear altitude corridor selected");

    await wait(450);
    setCurrentStatus("IN FLIGHT");
    pushCommand("Resume flight");
    await animateRoute(routes, "C", 0.42, 0.8, 1800, setDronePosition, setRouteProgress);

    setCurrentStatus("OBSTACLE DETECTED");
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Agent", "Primary drop-off zone marked blocked");

    await wait(450);
    setSlackNotified(true);
    pushIntegrationEvent("Slack", "Alternate drop-off approval requested");

    await wait(450);
    pushIntegrationEvent("Operator", "Alternate Drop-off B approved");

    await wait(400);
    pushIntegrationEvent("Agent", "Destination updated, flight resumed");
    setCurrentStatus("IN FLIGHT");
    setLiveBattery((current) => (current === null ? null : current - 5));
    await animateRoute(routes, "C", 0.8, 1, 1600, setDronePosition, setRouteProgress);

    pushCommand("Verify drop-off zone");
    await wait(450);
    setCurrentStatus("DELIVERED");
    setEtaLabel("Delivered");
    setFleet((current) => current.map((drone) => (drone.model === droneModel ? { ...drone, status: "Available" } : drone)));
    settleIntegrationFlow();
  }

  function resetDemo() {
    window.localStorage.removeItem(memoryStorageKey);
    resetMissionCounter();
    setMissions([]);
    setSelectedMissionId(null);
    setShowNewMissionModal(false);
    setIsRunningPreflight(false);
    setIsLaunching(false);
    setFleet(makeInitialFleet());
    setRouteStatuses(makeInitialRouteStatuses());
    setCurrentStatus("READY");
    setActiveMission(null);
    setActiveMapScene(defaultMapScene);
    setSelectedDrone("Pending");
    setSelectedRoute(null);
    setMemory(null);
    setHazardVisible(false);
    setDronePosition(dispatchOrigin);
    setRouteProgress(0);
    setLiveBattery(null);
    setEtaLabel("--");
    setCommandLog([]);
    setFlightModeOverride(null);
    setApproval(null);
    setSlackNotified(false);
    setIntegrationEvents([]);
    setConnectionState("online");
    setTopTab("planning");
    setHasVisitedLive(false);
  }

  function simulateApprovalRequired() {
    if (isLaunching || approval) {
      return;
    }

    setFlightModeOverride("HOLD");
    setApproval({
      category: "Low-confidence obstacle",
      reason: "Secondary object detected near Route C corridor at 61% confidence.",
      recommendedAction: "Hold position and re-scan before approving reroute.",
    });
    pushCommand("Hold position");
    setSlackNotified(true);
    pushIntegrationEvent("Slack", "Operator notified, approval requested");
  }

  function resolveApproval(decision: ApprovalDecision) {
    if (!approval) {
      return;
    }

    if (decision === "approve-reroute") {
      setApproval(null);
      setFlightModeOverride(null);
      pushCommand("Resume flight");
      pushIntegrationEvent("Operator", "Reroute approved");
      return;
    }

    if (decision === "return-home") {
      setApproval(null);
      setFlightModeOverride("RETURNING");
      pushCommand("Resume flight");
      pushIntegrationEvent("Operator", "Return home approved");
      void animateRoute(activeMapScene.routes, selectedRoute ?? "A", routeProgress, 0, 1400, setDronePosition, setRouteProgress).then(() => {
        resetDemo();
      });
      return;
    }

    setIntegrationEvents((current) => settleLastIntegrationEvent(current, "Failed"));
    resetDemo();
  }

  function toggleConnection() {
    setConnectionState((current) => (current === "online" ? "offline" : "online"));
  }

  function handleTopTabChange(tab: TopTab) {
    if (tab === "live" && !liveEnabled) {
      return;
    }
    if (tab === "live") {
      setHasVisitedLive(true);
    }
    setTopTab(tab);
  }

  return (
    <main className="h-screen overflow-hidden bg-white p-3 text-black">
      <div className="mx-auto flex h-full max-w-[1440px] flex-col gap-3">
        <TopBar liveEnabled={liveEnabled} onNewMission={() => setShowNewMissionModal(true)} onTopTabChange={handleTopTabChange} topTab={topTab} />

        {/* Both tabs stay mounted so the 3D map (and its animation state) survives
            switching between Mission Planning and Live Mission — only visibility toggles. */}
        <div className={cn("contents", topTab !== "planning" && "hidden")}>
          <MissionPlanningTab
            isLaunching={isLaunching}
            isRunningPreflight={isRunningPreflight}
            missions={missions}
            onLaunchMission={handleLaunchMission}
            onNewMission={() => setShowNewMissionModal(true)}
            onNextStep={handleNextStep}
            onReset={resetDemo}
            onRunPreflight={handleRunPreflight}
            onSelectMission={setSelectedMissionId}
            selectedMission={selectedMission}
          />
        </div>
        <div className={cn("contents", topTab !== "live" && "hidden")}>
          {hasVisitedLive ? (
          <LiveMissionTab
            activeMission={activeMission}
            airspaceEval={selectedMission?.airspaceEval ?? null}
            approval={approval}
            commandLog={commandLog}
            connectionState={connectionState}
            currentStatus={currentStatus}
            dronePosition={dronePosition}
            etaLabel={etaLabel}
            fleet={fleet}
            flightModeOverride={flightModeOverride}
            hazardVisible={hazardVisible}
            integrationEvents={integrationEvents}
            isRunning={isLaunching}
            liveBattery={liveBattery}
            mapScene={activeMapScene}
            memory={memory}
            onResolveApproval={resolveApproval}
            onSimulateApproval={simulateApprovalRequired}
            onToggleConnection={toggleConnection}
            routeProgress={routeProgress}
            routeStatuses={routeStatuses}
            selectedDrone={selectedDrone}
            selectedRoute={selectedRoute}
            slackNotified={slackNotified}
          />
          ) : null}
        </div>
      </div>

      {showNewMissionModal ? <NewMissionModal onCancel={() => setShowNewMissionModal(false)} onCreate={handleCreateMission} /> : null}
    </main>
  );
}

function routeEtaMinutes(routeId: RouteId | null): number {
  if (routeId === "B") return 9;
  if (routeId === "C") return 8;
  return 7;
}

function routeStatusesFromEval(mission: Mission): Record<RouteId, RouteStatus> {
  if (!mission.routeEval) {
    return makeInitialRouteStatuses();
  }

  return Object.fromEntries(mission.routeEval.map((row) => [row.id, row.status])) as Record<RouteId, RouteStatus>;
}

function TopBar({
  liveEnabled,
  onNewMission,
  onTopTabChange,
  topTab,
}: {
  liveEnabled: boolean;
  onNewMission: () => void;
  onTopTabChange: (tab: TopTab) => void;
  topTab: TopTab;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between rounded-[24px] border border-neutral-200 bg-white px-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)]">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-geist text-xl font-semibold tracking-[-0.04em] text-black">Drone Fleet Intelligence</h1>
          <span className="rounded-full bg-black px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white">
            Simulation
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Different drones. One shared intelligence layer.</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onNewMission}
          className="rounded-2xl border border-black bg-black px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:bg-neutral-800"
        >
          New Mission
        </button>
        <nav className="flex items-center gap-1 rounded-2xl bg-neutral-100 p-1">
          <TopTabButton active={topTab === "planning"} onClick={() => onTopTabChange("planning")}>
            Mission Planning
          </TopTabButton>
          <TopTabButton active={topTab === "live"} disabled={!liveEnabled} onClick={() => onTopTabChange("live")}>
            Live Mission
          </TopTabButton>
        </nav>
        <div className="flex items-center gap-2">
          <ConnectionIndicator icon={Database} label="Airtable" />
          <ConnectionIndicator icon={Radio} label="Slack" />
        </div>
      </div>
    </header>
  );
}

function TopTabButton({
  active,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean;
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "Complete preflight to unlock Live Mission" : undefined}
      className={cn(
        "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition",
        disabled
          ? "cursor-not-allowed text-neutral-300"
          : active
            ? "bg-black text-white shadow-sm"
            : "text-neutral-600 hover:bg-white hover:text-black",
      )}
    >
      {children}
    </button>
  );
}

function ConnectionIndicator({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-black">
      <Icon className="h-3.5 w-3.5 text-emerald-600" />
      {label}
    </span>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function animateRoute(
  routes: DemoRoute[],
  routeId: RouteId,
  from: number,
  to: number,
  durationMs: number,
  setDronePosition: Dispatch<SetStateAction<GeoPoint3D>>,
  setProgress: Dispatch<SetStateAction<number>>,
) {
  return new Promise<void>((resolve) => {
    const startedAt = performance.now();

    function tick(now: number) {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const routeProgress = from + (to - from) * progress;
      setDronePosition(interpolateRoute(routes, routeId, routeProgress));
      setProgress(routeProgress);

      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }

      resolve();
    }

    window.requestAnimationFrame(tick);
  });
}
