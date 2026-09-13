"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Database, Radio, type LucideIcon } from "lucide-react";
import { dispatchOrigin } from "@/data/demo-routes";
import { makeFallbackWeatherResponse } from "@/data/demo-weather";
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
  demoPresetInputs,
  evaluateAirspaceForMission,
  evaluateFleetForMission,
  evaluateMemoriesAgainstRoutes,
  evaluateMissionRiskReview,
  evaluateRoutesForMission,
  evaluateWeatherForDrones,
  fleetSnapshotForPreflight,
  interpolateRoute,
  isMemoryActive,
  makeInitialFleet,
  makeInitialRouteStatuses,
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
  type MemoryApiResponse,
  type MemoryFetchState,
  type MemoryMode,
  type Mission,
  type MissionMapScene,
  type MissionRiskCondition,
  type MissionRiskReview,
  type MissionRun,
  type MissionState,
  type NewMissionInput,
  type OperationalMemory,
  type PreflightStepId,
  type RouteId,
  type RouteStatus,
  type SlackApprovalApiResponse,
  type StepEvidence,
  type TopTab,
  type WeatherMode,
  type WeatherResponse,
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
  const [slackConnectionState, setSlackConnectionState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [integrationEvents, setIntegrationEvents] = useState<IntegrationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<"online" | "offline">("online");
  const runTokenRef = useRef(0);
  const approvalWaitTokenRef = useRef(0);
  const demoApprovalDecisionRef = useRef<ApprovalDecision | null>(null);

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

  async function runStep(missionId: string, stepId: PreflightStepId, compute: () => StepEvidence): Promise<StepEvidence> {
    updateMission(missionId, (mission) => ({
      ...mission,
      activeStepId: stepId,
      steps: { ...mission.steps, [stepId]: { ...mission.steps[stepId], status: "Evaluating" } },
    }));
    await wait(420);
    const evidence = compute();
    updateMission(missionId, (mission) => ({ ...mission, steps: { ...mission.steps, [stepId]: evidence } }));
    await wait(620);
    return evidence;
  }

  async function advancePreflightStep(missionId: string) {
    if (isRunningPreflight) {
      return;
    }

    const mission = missions.find((candidate) => candidate.id === missionId);

    if (!mission || (mission.lifecycle !== "NEW" && mission.lifecycle !== "PREFLIGHT")) {
      return;
    }

    setIsRunningPreflight(true);
    try {
      await runNextPreflightStep(mission);
    } finally {
      setIsRunningPreflight(false);
    }
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

  function handleWeatherModeChange(mode: WeatherMode) {
    if (!selectedMission || selectedMission.steps.WEATHER.status !== "Waiting" || isRunningPreflight) {
      return;
    }
    updateMission(selectedMission.id, (mission) => ({ ...mission, weatherMode: mode }));
  }

  function handleMemoryModeChange(mode: MemoryMode) {
    if (!selectedMission || selectedMission.steps.MEMORY.status !== "Waiting" || isRunningPreflight) {
      return;
    }
    updateMission(selectedMission.id, (mission) => ({ ...mission, memoryMode: mode }));
  }

  function handleLaunchMission() {
    if (!selectedMission || selectedMission.lifecycle !== "READY" || isLaunching) {
      return;
    }
    void launchMission(selectedMission);
  }

  function updateLiveTelemetry(mission: Mission, progress: number) {
    const startingBattery = fleet.find((drone) => drone.model === mission.confirmedDrone)?.batteryPercent ?? 100;
    const reserveFloor = 30;
    const usedBattery = 18 * Math.min(1, Math.max(0, progress));
    setLiveBattery(Math.max(reserveFloor, startingBattery - usedBattery));
    setEtaLabel(estimatedRemainingEtaLabel(mission, progress));
  }

  function handleCreatePreset(pattern: MissionRun) {
    const mission = createMission(demoPresetInputs[pattern], pattern);
    setMissions((current) => [...current, mission]);
    setSelectedMissionId(mission.id);
    setShowNewMissionModal(false);
  }

  async function runNextPreflightStep(mission: Mission): Promise<Mission> {
    const nextStepId = preflightStepOrder.find((id) => mission.steps[id]?.status === "Waiting");

    if (!nextStepId) {
      return mission;
    }

    let nextMission = mission.lifecycle === "NEW" ? { ...mission, lifecycle: "PREFLIGHT" as const } : mission;
    if (mission.lifecycle === "NEW") {
      updateMission(mission.id, (current) => ({ ...current, lifecycle: "PREFLIGHT" }));
    }

    switch (nextStepId) {
      case "REQUEST": {
        const evidence = await runStep(mission.id, "REQUEST", () => buildRequestStepEvidence(nextMission.input));
        nextMission = { ...nextMission, activeStepId: "REQUEST", steps: { ...nextMission.steps, REQUEST: evidence } };
        break;
      }
      case "FLEET": {
        const fleetSnapshot = fleetSnapshotForPreflight(fleet, nextMission.pattern);
        const fleetRows = evaluateFleetForMission(fleetSnapshot, nextMission.input.weightKg, nextMission.input.deliveryType);
        const provisional = pickProvisionalDrone(fleetRows);
        const evidence = await runStep(mission.id, "FLEET", () => buildFleetStepEvidence(fleetRows, nextMission.input.weightKg));
        nextMission = {
          ...nextMission,
          activeStepId: "FLEET",
          fleetEligibility: fleetRows,
          provisionalDrone: provisional?.drone.model ?? null,
          steps: { ...nextMission.steps, FLEET: evidence },
        };
        updateMission(mission.id, () => nextMission);
        break;
      }
      case "WEATHER": {
        updateMission(mission.id, (current) => ({
          ...current,
          activeStepId: "WEATHER",
          weatherFetchState: "LOADING",
          weatherFetchMessage: "Requesting pickup and drop-off conditions…",
          steps: {
            ...current.steps,
            WEATHER: {
              ...current.steps.WEATHER,
              input: ["Loading pickup and drop-off weather from the server…"],
              source: ["Server-side weather service"],
              status: "Evaluating",
            },
          },
        }));
        await wait(420);
        const weatherResponse = await fetchMissionWeather(nextMission);
        const weatherResult = evaluateWeatherForDrones(nextMission.fleetEligibility ?? [], weatherResponse.weather);
        const evidence = buildWeatherStepEvidence({
          weather: weatherResponse.weather,
          evaluation: weatherResult,
          fetchState: weatherResponse.status,
          fetchMessage: weatherResponse.message,
        });
        nextMission = {
          ...nextMission,
          activeStepId: "WEATHER",
          lifecycle: weatherResult.paused ? "HOLD" : nextMission.lifecycle,
          confirmedDrone: weatherResult.confirmedDrone?.model ?? null,
          weatherFetchState: weatherResponse.status,
          weatherFetchMessage: weatherResponse.message,
          weather: weatherResponse.weather,
          weatherEvaluation: weatherResult,
          cruiseSpeedMph: weatherResult.cruiseSpeedMph,
          etaDeltaMin: weatherResult.etaDeltaMin,
          steps: { ...nextMission.steps, WEATHER: evidence },
        };
        updateMission(mission.id, () => nextMission);
        await wait(620);
        break;
      }
      case "ROUTES": {
        const routeAMatch = nextMission.memoryMatches.find((match) => match.matched && match.routeId === "A");
        const blockingMemory = routeAMatch
          ? nextMission.memories.find((candidate) => candidate.id === routeAMatch.memoryId) ?? null
          : null;
        const memoryActive = Boolean(routeAMatch);
        const routesResult = evaluateRoutesForMission(memoryActive, nextMission.airspaceEval, blockingMemory?.id ?? null);
        const airspaceBlocksRouteA = Boolean(
          nextMission.airspaceEval && !nextMission.airspaceEval.routeResults.find((row) => row.id === "A")?.eligible,
        );
        const evidence = await runStep(mission.id, "ROUTES", () =>
          buildRoutesStepEvidence({
            rows: routesResult.rows,
            selectedRoute: routesResult.selectedRoute,
            droneModel: nextMission.confirmedDrone,
            memoryBlocksRouteA: memoryActive,
            blockingMemoryIds: blockingMemory ? [blockingMemory.id] : [],
            airspaceBlocksRouteA,
          }),
        );
        nextMission = {
          ...nextMission,
          activeStepId: "ROUTES",
          routeEval: routesResult.rows,
          selectedRoute: routesResult.selectedRoute,
          steps: { ...nextMission.steps, ROUTES: evidence },
        };
        updateMission(mission.id, () => nextMission);
        break;
      }
      case "AIRSPACE": {
        const airspaceEval = evaluateAirspaceForMission(nextMission.selectedRoute);
        const evidence = await runStep(mission.id, "AIRSPACE", () => buildAirspaceStepEvidence(airspaceEval));
        nextMission = {
          ...nextMission,
          activeStepId: "AIRSPACE",
          airspaceEval,
          steps: { ...nextMission.steps, AIRSPACE: evidence },
        };
        updateMission(mission.id, () => nextMission);
        break;
      }
      case "MEMORY": {
        updateMission(mission.id, (current) => ({
          ...current,
          activeStepId: "MEMORY",
          memoryFetchState: "LOADING",
          memoryFetchMessage: "Loading active operational memories…",
          steps: {
            ...current.steps,
            MEMORY: {
              ...current.steps.MEMORY,
              input: ["Loading active, non-expired shared memories…"],
              source: [
                current.memoryMode === "AIRTABLE"
                  ? "Airtable server integration"
                  : "localStorage DEMO_FALLBACK",
              ],
              status: "Evaluating",
            },
          },
        }));
        await wait(420);
        const memoryResponse = await loadMissionMemories(nextMission);
        const retrievedMemories =
          memoryResponse.status === "SUCCESS"
            ? memoryResponse.memories.map((item) =>
                nextMission.pattern === "MISSION_2" && nextMission.confirmedDrone
                  ? markMemoryUsed(item, nextMission.confirmedDrone)
                  : item,
              )
            : [];
        const normalizedResponse = { ...memoryResponse, memories: retrievedMemories };
        const matches =
          memoryResponse.status === "SUCCESS"
            ? evaluateMemoriesAgainstRoutes(retrievedMemories, nextMission.mapScene.routes)
            : [];
        const evidence = buildMemoryStepEvidence({
          response: normalizedResponse,
          matches,
          retrievedBy: nextMission.pattern === "MISSION_2" ? nextMission.confirmedDrone : null,
        });
        const failed = memoryResponse.status !== "SUCCESS";
        const activeMemory =
          retrievedMemories.find((item) =>
            matches.some((match) => match.memoryId === item.id && match.matched),
          ) ?? retrievedMemories[0] ?? null;
        const routeABlockedByMemory = matches.some((match) => match.matched && match.routeId === "A");
        const reroutedByMemory =
          activeMemory && routeABlockedByMemory
            ? evaluateRoutesForMission(true, nextMission.airspaceEval, activeMemory.id)
            : null;
        setMemory(activeMemory);
        setHazardVisible(Boolean(activeMemory));
        nextMission = {
          ...nextMission,
          activeStepId: "MEMORY",
          lifecycle: failed ? "HOLD" : nextMission.lifecycle,
          approvalRequired: failed,
          memoryFetchState: memoryResponse.status,
          memoryFetchMessage: memoryResponse.message,
          memories: retrievedMemories,
          memoryMatches: matches,
          routeEval: reroutedByMemory?.rows ?? nextMission.routeEval,
          selectedRoute: reroutedByMemory?.selectedRoute ?? nextMission.selectedRoute,
          steps: { ...nextMission.steps, MEMORY: evidence },
        };
        updateMission(mission.id, () => nextMission);
        await wait(620);
        break;
      }
      case "APPROVAL": {
        const review = evaluateMissionRiskReview(nextMission);
        if (review.level === "SAFE") {
          const evidence = await runStep(mission.id, "APPROVAL", () =>
            buildApprovalStepEvidence(review),
          );
          nextMission = {
            ...nextMission,
            activeStepId: "APPROVAL",
            riskReview: review,
            approvalRequired: false,
            steps: { ...nextMission.steps, APPROVAL: evidence },
          };
          updateMission(mission.id, () => nextMission);
          break;
        }

        if (review.level === "UNSAFE") {
          const evidence = await runStep(mission.id, "APPROVAL", () =>
            buildApprovalStepEvidence(review),
          );
          nextMission = {
            ...nextMission,
            activeStepId: "APPROVAL",
            riskReview: review,
            approvalRequired: false,
            lifecycle: "HOLD",
            steps: { ...nextMission.steps, APPROVAL: evidence },
          };
          updateMission(mission.id, () => nextMission);
          break;
        }

        const waitToken = approvalWaitTokenRef.current + 1;
        approvalWaitTokenRef.current = waitToken;
        demoApprovalDecisionRef.current = null;
        const pendingEvidence = buildApprovalStepEvidence(review);
        nextMission = {
          ...nextMission,
          activeStepId: "APPROVAL",
          riskReview: review,
          approvalRequired: true,
          lifecycle: "HOLD",
          steps: { ...nextMission.steps, APPROVAL: pendingEvidence },
        };
        updateMission(mission.id, () => nextMission);

        const recommendation = Array.from(
          new Set(review.conditions.map((condition) => condition.agentRecommendation)),
        ).join(" ");
        const adjustments = review.conditions
          .map((condition) => condition.proposedAdjustment)
          .join(" ");
        const baseApproval: ApprovalRequest = {
          category: "Mission caution review",
          reason: review.summary,
          recommendedAction: recommendation,
          requestId: null,
          status: "SENDING",
          transport: "SLACK",
          missionId: mission.id,
          droneName: nextMission.confirmedDrone ?? "Unassigned",
          proposedAlternative: adjustments,
          routeImpact:
            review.conditions
              .filter((condition) => condition.kind === "ROUTE_ADJUSTMENT")
              .map((condition) => condition.proposedAdjustment)
              .join(" ") || "No route change; apply the listed operating controls.",
          statusMessage: "Creating one grouped Slack mission review.",
          risks: review.conditions,
        };
        setApproval(baseApproval);
        setSlackConnectionState("loading");

        const initialApproval = await requestSlackApproval({
          idempotencyKey: `${mission.id}:preflight-caution:${review.conditions.map((condition) => condition.id).sort().join(",")}`,
          missionId: mission.id,
          droneName: nextMission.confirmedDrone ?? "Unassigned",
          currentStatus: "PREFLIGHT HOLD",
          coordinates: {
            lat: nextMission.mapScene.origin.lat,
            lng: nextMission.mapScene.origin.lng,
            altitudeM: nextMission.mapScene.origin.altitude,
          },
          reason: review.summary,
          risks: review.conditions,
          proposedAlternative: adjustments,
          routeImpact: baseApproval.routeImpact ?? "Apply caution controls.",
          etaImpact: `Current plan ETA impact: +${nextMission.etaDeltaMin} min from weather controls.`,
        });
        if (approvalWaitTokenRef.current !== waitToken) return nextMission;
        setApproval(toUiApproval(baseApproval, initialApproval));
        setSlackConnectionState(
          initialApproval.transport === "SLACK" ? "success" : "error",
        );

        const finalApproval = await waitForApprovalResolution(
          initialApproval,
          baseApproval,
          () => approvalWaitTokenRef.current === waitToken,
        );
        if (approvalWaitTokenRef.current !== waitToken) return nextMission;
        setApproval(toUiApproval(baseApproval, finalApproval));

        const operatorDecision =
          finalApproval.status === "APPROVED"
            ? "APPROVED"
            : finalApproval.status === "REJECTED"
              ? "REJECTED"
              : finalApproval.status === "TIMED_OUT"
                ? "TIMED_OUT"
                : "HELD";
        const evidence = buildApprovalStepEvidence(review, operatorDecision);
        if (finalApproval.status === "APPROVED") {
          const adjustedMission = applyApprovedCautionAdjustments(nextMission, review);
          nextMission = {
            ...adjustedMission,
            activeStepId: "APPROVAL",
            approvalRequired: false,
            lifecycle: "PREFLIGHT",
            steps: { ...adjustedMission.steps, APPROVAL: evidence },
          };
          setApproval(null);
        } else {
          nextMission = {
            ...nextMission,
            activeStepId: "APPROVAL",
            approvalRequired: finalApproval.status !== "REJECTED",
            lifecycle: finalApproval.status === "REJECTED" ? "ABORTED" : "HOLD",
            steps: { ...nextMission.steps, APPROVAL: evidence },
          };
        }
        updateMission(mission.id, () => nextMission);
        break;
      }
      case "READY": {
        const memoryActive = nextMission.pattern === "MISSION_2";
        const plan = buildApprovedPlan({
          version: memoryActive ? 2 : 1,
          droneModel: nextMission.confirmedDrone ?? "Unassigned",
          routeId: nextMission.selectedRoute ?? "A",
          speedMph: nextMission.cruiseSpeedMph ?? BASE_CRUISE_SPEED_MPH,
          primaryDropOff: `${nextMission.input.dropOffPreference} Zone A`,
          backupDropOff: memoryActive ? "Alternate courtyard Zone B" : "Route C fallback zone",
          memoriesUsed: Array.from(
            new Set(nextMission.memoryMatches.filter((match) => match.matched).map((match) => match.memoryId)),
          ),
          weatherTimestamp: nextMission.weather?.updatedAt ?? "Unavailable",
          approvalStatus:
            nextMission.riskReview?.level === "CAUTION"
              ? "CAUTION controls approved by operator"
              : "SAFE · autonomous launch approved",
        });
        const evidence = await runStep(mission.id, "READY", () => buildReadyStepEvidence(plan));
        nextMission = {
          ...nextMission,
          activeStepId: "READY",
          plan,
          lifecycle: "READY",
          steps: { ...nextMission.steps, READY: evidence },
        };
        updateMission(mission.id, () => nextMission);
        break;
      }
      default:
        break;
    }

    return nextMission;
  }

  async function launchMission(mission: Mission) {
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;
    setIsLaunching(true);
    setApproval(null);
    setFlightModeOverride(null);
    setSlackConnectionState("idle");
    demoApprovalDecisionRef.current = null;
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
    updateLiveTelemetry(mission, 0);
    pushIntegrationEvent("Agent", `Approved plan loaded: ${mission.confirmedDrone}, Route ${mission.selectedRoute}, weather, airspace, and memory state`);
    if (mission.weather) {
      pushIntegrationEvent(
        "OpenWeather",
        `${mission.weather.dataSource}: ${mission.weather.gustMph} mph gust; ${mission.weatherEvaluation?.severity ?? "UNKNOWN"} decision applied`,
        "Completed",
      );
    }

    const outcome: "COMPLETED" | "HELD" | "REJECTED" =
      mission.pattern === "MISSION_1"
        ? (await runLiveMission1(mission, runToken))
          ? "COMPLETED"
          : "HELD"
        : (await runLiveMission2(mission, runToken)) ?? "HELD";

    if (!isRunActive(runToken)) {
      return;
    }
    if (outcome === "HELD") {
      updateMission(mission.id, (current) => ({ ...current, lifecycle: "HOLD", approvalRequired: true }));
      setIsLaunching(false);
      return;
    }
    if (outcome === "REJECTED") {
      updateMission(mission.id, (current) => ({ ...current, lifecycle: "ABORTED", approvalRequired: false }));
      setIsLaunching(false);
      return;
    }
    updateMission(mission.id, (current) => ({ ...current, lifecycle: "DELIVERED" }));
    setIsLaunching(false);
  }

  function isRunActive(runToken: number) {
    return runTokenRef.current === runToken;
  }

  async function runLiveMission1(mission: Mission, runToken: number) {
    const droneModel = mission.confirmedDrone ?? "Atlas HeavyLift";
    const routes = mission.mapScene.routes;
    const flightRoute: RouteId = mission.selectedRoute ?? "B";

    await wait(500);
    if (!isRunActive(runToken)) return;
    await animateRoute(
      routes,
      flightRoute,
      0,
      0.58,
      adjustedAnimationDuration(mission, 2400),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return;

    setCurrentStatus("OBSTACLE DETECTED");
    setHazardVisible(true);
    setRouteStatuses({ A: "blocked", B: flightRoute === "B" ? "selected" : "candidate", C: flightRoute === "C" ? "selected" : "candidate" });
    setLiveBattery((current) => (current === null ? null : current - 2));
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Agent", "Obstacle detected: crane intersects the active route corridor", "Completed");
    pushIntegrationEvent("Gemini", "Construction crane classified at 92% confidence");

    await wait(500);
    if (!isRunActive(runToken)) return;
    const sourceDrone = fleet.find((drone) => drone.model === droneModel);
    const newMemory = createCraneMemory({
      sourceDrone: droneModel,
      sourceVendor: sourceDrone?.vendor ?? "Unknown vendor",
      sourceMission: mission.id,
      location: mission.mapScene.hazard.center,
      dataSource: mission.memoryMode === "AIRTABLE" ? "AIRTABLE" : "DEMO_FALLBACK",
    });
    setMemory(newMemory);
    pushCommand("Reject Route A");
    pushIntegrationEvent(
      "Agent",
      `Memory structured: ${newMemory.id}, coordinates, altitude band, radius, source, and expiry`,
      "Completed",
    );
    pushIntegrationEvent(
      mission.memoryMode === "AIRTABLE" ? "Airtable" : "Agent",
      mission.memoryMode === "AIRTABLE"
        ? `Saving ${newMemory.id} to Airtable`
        : `Saving ${newMemory.id} to localStorage DEMO_FALLBACK`,
    );

    const saveResponse = await saveMissionMemory(mission, newMemory);
    if (!isRunActive(runToken)) return;
    if (saveResponse.status !== "SUCCESS" || !saveResponse.memories[0]) {
      const failedMemory: OperationalMemory = { ...newMemory, airtableStatus: "failed" };
      setMemory(failedMemory);
      setFlightModeOverride("HOLD");
      setEtaLabel("Holding");
      setApproval({
        category: "Missing safety data",
        reason: `${saveResponse.status}: ${saveResponse.message} The operational memory was not persisted.`,
        recommendedAction: "Keep the mission paused and choose Return Home or Cancel Mission.",
        requestId: null,
        status: "SLACK_UNAVAILABLE",
        transport: "DEMO_FALLBACK",
        statusMessage: "This safety-data failure was not sent to Slack. DEMO_FALLBACK controls are available.",
      });
      pushIntegrationEvent("Airtable", saveResponse.message, "Failed");
      return false;
    }

    const savedMemory = saveResponse.memories[0];
    setMemory(savedMemory);
    setCurrentStatus("MEMORY SAVED");
    pushIntegrationEvent(
      saveResponse.source === "AIRTABLE" ? "Airtable" : "Agent",
      saveResponse.duplicate
        ? `Duplicate prevented; using existing ${savedMemory.id}`
        : saveResponse.message,
      "Completed",
    );

    // The learned crane memory blocks Route A from this point forward.
    if (flightRoute === "A") {
      await wait(450);
      setCurrentStatus("REROUTING");
      setSelectedRoute("C");
      setRouteStatuses({ A: "blocked", B: "candidate", C: "selected" });
      setEtaLabel("3 min");
      pushCommand("Select Route C");
      pushIntegrationEvent("Google Maps 3D", "Route A blocked, Route C rendered");

      await wait(500);
      if (!isRunActive(runToken)) return;
      pushCommand("Resume flight");
      setCurrentStatus("IN FLIGHT");
      setLiveBattery((current) => (current === null ? null : current - 4));
      await animateRoute(
        routes,
        "C",
        0.24,
        1,
        adjustedAnimationDuration(mission, 2600),
        setDronePosition,
        setRouteProgress,
        (progress) => updateLiveTelemetry(mission, progress),
        () => isRunActive(runToken),
      );
    } else {
      await wait(450);
      if (!isRunActive(runToken)) return;
      pushCommand(`Resume flight on Route ${flightRoute}`);
      setCurrentStatus("IN FLIGHT");
      setSelectedRoute(flightRoute);
      setRouteStatuses({ A: "blocked", B: flightRoute === "B" ? "selected" : "candidate", C: flightRoute === "C" ? "selected" : "candidate" });
      setEtaLabel("3 min");
      pushIntegrationEvent("Google Maps 3D", `Route A blocked in memory; continuing Route ${flightRoute}`);
      setLiveBattery((current) => (current === null ? null : current - 4));
      await animateRoute(
        routes,
        flightRoute,
        0.58,
        1,
        adjustedAnimationDuration(mission, 2200),
        setDronePosition,
        setRouteProgress,
        (progress) => updateLiveTelemetry(mission, progress),
        () => isRunActive(runToken),
      );
    }

    if (!isRunActive(runToken)) return;
    pushCommand("Verify drop-off zone");
    await wait(450);
    if (!isRunActive(runToken)) return;
    setCurrentStatus("DELIVERED");
    setEtaLabel("Delivered");
    setFleet((current) => current.map((drone) => (drone.model === droneModel ? { ...drone, status: "Available" } : drone)));
    settleIntegrationFlow();
    return true;
  }

  async function runLiveMission2(mission: Mission, runToken: number) {
    const droneModel = mission.confirmedDrone ?? "CargoSwift S2";
    const routes = mission.mapScene.routes;

    const retrievedMemory = mission.memories.find((item) => item.usedBy === droneModel) ?? mission.memories[0] ?? null;
    pushIntegrationEvent(
      retrievedMemory?.dataSource === "AIRTABLE" ? "Airtable" : "Agent",
      retrievedMemory
        ? `${retrievedMemory.dataSource}: ${droneModel} retrieved ${retrievedMemory.id} created by ${retrievedMemory.learnedBy}`
        : "No route-blocking memory loaded",
      "Completed",
    );
    if (retrievedMemory) {
      pushIntegrationEvent(
        "Agent",
        `${retrievedMemory.id} matched Route A coordinates and altitude; Route A rejected before launch, Route ${mission.selectedRoute} selected`,
        "Completed",
      );
    }
    if (retrievedMemory) {
      const usedMemory = markMemoryUsed(retrievedMemory, droneModel);
      setMemory(usedMemory);
    }

    await wait(500);
    if (!isRunActive(runToken)) return;
    await animateRoute(
      routes,
      "C",
      0,
      0.42,
      adjustedAnimationDuration(mission, 2200),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return;

    setCurrentStatus("OBSTACLE DETECTED");
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Gemini", "Temporary altitude obstacle classified at 81% confidence");

    await wait(500);
    if (!isRunActive(runToken)) return;
    pushCommand("Climb to clear altitude corridor");
    setFlightModeOverride("REROUTING");
    pushIntegrationEvent("Agent", "Verified clear altitude corridor selected");
    await animateAltitudeAtCurrentPosition(172, 900, setDronePosition, () => isRunActive(runToken));

    await wait(450);
    if (!isRunActive(runToken)) return;
    setCurrentStatus("IN FLIGHT");
    setFlightModeOverride(null);
    pushCommand("Resume flight");
    await animateRoute(
      routes,
      "C",
      0.42,
      0.8,
      adjustedAnimationDuration(mission, 1800),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return;

    setCurrentStatus("OBSTACLE DETECTED");
    setFlightModeOverride("HOLD");
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Agent", "Drop-off blocked: ground activity detected at the original delivery zone", "Completed");
    pushIntegrationEvent("Agent", "Drone holding safely at the final approach waypoint", "Completed");

    const holdingPoint = interpolateRoute(routes, "C", 0.8);
    const baseApproval: ApprovalRequest = {
      category: "Blocked drop-off zone",
      reason: "Primary entrance drop-off is temporarily blocked by ground activity near the destination.",
      recommendedAction: "Approve Alternate Drop-off B and continue the delivery.",
      requestId: null,
      status: "SENDING",
      transport: "SLACK",
      missionId: mission.id,
      droneName: droneModel,
      proposedAlternative: `Alternate Drop-off B (${mission.mapScene.alternateDropOffB.lat.toFixed(5)}, ${mission.mapScene.alternateDropOffB.lng.toFixed(5)})`,
      routeImpact: "Divert Route C final approach by 0.3 km; ETA +2 min.",
      statusMessage: "Creating a signed Slack approval request.",
      risks: [
        {
          id: "blocked-delivery-zone",
          kind: "DELIVERY_ZONE",
          level: "CAUTION",
          riskDetected: "Original delivery zone is blocked by temporary ground activity.",
          currentValue: "Primary entrance unavailable",
          allowedLimit: "Delivery zone must be clear before package release",
          agentRecommendation: "Use the verified alternate courtyard drop-off.",
          proposedAdjustment: "Divert to Alternate Drop-off B; Route C ETA +2 min.",
        },
      ],
    };
    setApproval(baseApproval);
    setSlackConnectionState("loading");
    pushIntegrationEvent("Slack", "Creating alternate drop-off approval request");

    const initialApproval = await requestSlackApproval({
      idempotencyKey: `${mission.id}:${mission.createdAt}:blocked-primary-dropoff`,
      missionId: mission.id,
      droneName: droneModel,
      currentStatus: "HOLDING safely",
      coordinates: {
        lat: holdingPoint.lat,
        lng: holdingPoint.lng,
        altitudeM: holdingPoint.altitude,
      },
      reason: baseApproval.reason,
      risks: baseApproval.risks ?? [],
      proposedAlternative: baseApproval.proposedAlternative ?? "Alternate Drop-off B",
      routeImpact: "Route C final approach diverts 0.3 km to the alternate courtyard.",
      etaImpact: "Estimated arrival increases by 2 minutes.",
    });
    if (!isRunActive(runToken)) return "HELD";

    setApproval(toUiApproval(baseApproval, initialApproval));
    if (initialApproval.status === "PENDING") {
      setSlackConnectionState("success");
      pushIntegrationEvent(
        "Slack",
        initialApproval.duplicate
          ? "Existing Slack approval reused; duplicate message prevented"
          : "Approval requested through Slack",
        "Completed",
      );
      pushIntegrationEvent("Operator", "Waiting for operator decision");
    } else if (initialApproval.status === "SENDING") {
      setSlackConnectionState("loading");
      pushIntegrationEvent(
        "Slack",
        "Existing Slack send is still completing; duplicate message prevented",
      );
      pushIntegrationEvent("Operator", "Waiting for Slack approval request");
    } else {
      setSlackConnectionState("error");
      pushIntegrationEvent("Slack", initialApproval.statusMessage, "Failed");
      pushIntegrationEvent("Operator", "Waiting for DEMO_FALLBACK decision");
    }

    const finalApproval = await waitForMissionApproval(initialApproval, baseApproval, runToken);
    if (!isRunActive(runToken)) return "HELD";
    setApproval(toUiApproval(baseApproval, finalApproval));

    if (finalApproval.status === "HELD" || finalApproval.status === "TIMED_OUT") {
      setFlightModeOverride("HOLD");
      setEtaLabel("Holding");
      pushIntegrationEvent(
        finalApproval.status === "TIMED_OUT" ? "Slack" : "Operator",
        finalApproval.statusMessage,
        finalApproval.status === "TIMED_OUT" ? "Failed" : "Completed",
      );
      pushCommand("Maintain safe hold");
      return "HELD";
    }

    if (finalApproval.status === "REJECTED") {
      setCurrentStatus("ABORTED");
      setFlightModeOverride("HOLD");
      setEtaLabel("Aborted");
      pushCommand("Abort mission");
      pushIntegrationEvent(
        "Operator",
        `Operator decision received: mission rejected${finalApproval.operatorName ? ` by ${finalApproval.operatorName}` : ""}`,
        "Completed",
      );
      pushIntegrationEvent("Agent", `Mission aborted: ${finalApproval.statusMessage}`, "Failed");
      setFleet((current) =>
        current.map((drone) =>
          drone.model === droneModel ? { ...drone, status: "Available" } : drone,
        ),
      );
      return "REJECTED";
    }

    if (finalApproval.status !== "APPROVED") {
      setFlightModeOverride("HOLD");
      pushIntegrationEvent("Slack", finalApproval.statusMessage, "Failed");
      return "HELD";
    }

    pushIntegrationEvent(
      "Operator",
      `Operator decision received: Alternate Drop-off B approved${finalApproval.operatorName ? ` by ${finalApproval.operatorName}` : ""}`,
      "Completed",
    );
    setApproval(null);
    const alternateRoutes = routes.map((route) =>
      route.id === "C"
        ? {
            ...route,
            waypoints: [...route.waypoints.slice(0, -1), mission.mapScene.alternateDropOffB],
          }
        : route,
    );
    setActiveMapScene((current) => ({
      ...current,
      routes: alternateRoutes,
      destination: current.alternateDropOffB,
      destinationLabel: "Alternate Drop-off B",
      dropOffZone: {
        id: "DZ-ALT-B",
        label: "Approved alternate drop-off B",
        point: current.alternateDropOffB,
      },
    }));
    pushIntegrationEvent("Agent", "Destination updated to Alternate Drop-off B; mission cleared to continue", "Completed");
    setFlightModeOverride(null);
    setCurrentStatus("IN FLIGHT");
    setLiveBattery((current) => (current === null ? null : current - 5));
    await animateRoute(
      alternateRoutes,
      "C",
      0.8,
      1,
      adjustedAnimationDuration(mission, 1600),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );

    if (!isRunActive(runToken)) return;
    pushCommand("Verify drop-off zone");
    await wait(450);
    if (!isRunActive(runToken)) return;
    setCurrentStatus("DELIVERED");
    setEtaLabel("Delivered");
    setFleet((current) => current.map((drone) => (drone.model === droneModel ? { ...drone, status: "Available" } : drone)));
    settleIntegrationFlow();
    return "COMPLETED";
  }

  async function waitForMissionApproval(
    initial: SlackApprovalApiResponse,
    baseApproval: ApprovalRequest,
    runToken: number,
  ): Promise<SlackApprovalApiResponse> {
    return waitForApprovalResolution(initial, baseApproval, () =>
      isRunActive(runToken),
    );
  }

  async function waitForApprovalResolution(
    initial: SlackApprovalApiResponse,
    baseApproval: ApprovalRequest,
    shouldContinue: () => boolean,
  ): Promise<SlackApprovalApiResponse> {
    let current = initial;

    while (shouldContinue()) {
      if (
        ["APPROVED", "HELD", "REJECTED", "TIMED_OUT"].includes(current.status)
      ) {
        return current;
      }

      if (current.transport === "DEMO_FALLBACK") {
        const demoDecision = demoApprovalDecisionRef.current;
        if (demoDecision) {
          return {
            ...current,
            status:
              demoDecision === "approve"
                ? "APPROVED"
                : demoDecision === "hold"
                  ? "HELD"
                  : "REJECTED",
            operatorName: "Demo operator",
            statusMessage:
              demoDecision === "approve"
                ? "DEMO_FALLBACK approved the agent-recommended adjustment."
                : demoDecision === "hold"
                  ? "DEMO_FALLBACK kept the mission safely paused."
                  : "DEMO_FALLBACK rejected the mission.",
          };
        }
      } else if (current.requestId) {
        const previousStatus = current.status;
        current = await pollSlackApproval(current.requestId, current);
        setApproval(toUiApproval(baseApproval, current));
        if (previousStatus === "SENDING" && current.status === "PENDING") {
          setSlackConnectionState("success");
          pushIntegrationEvent("Slack", "Approval requested through Slack", "Completed");
          pushIntegrationEvent("Operator", "Waiting for operator decision");
        }
      }

      await wait(1_500);
    }

    return {
      ...current,
      status: "HELD",
      statusMessage: "Approval wait ended; the mission remains safely paused.",
    };
  }

  function resetDemo() {
    runTokenRef.current += 1;
    approvalWaitTokenRef.current += 1;
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
    setSlackConnectionState("idle");
    demoApprovalDecisionRef.current = null;
    setIntegrationEvents([]);
    setConnectionState("online");
    setTopTab("planning");
    setHasVisitedLive(false);
  }

  function simulateApprovalRequired() {
    if (isLaunching || approval) {
      return;
    }

    void requestLowConfidenceObstacleApproval();
  }

  async function requestLowConfidenceObstacleApproval() {
    const missionId = selectedMission?.id ?? "live-demo";
    const risk: MissionRiskCondition = {
      id: "low-confidence-live-obstacle",
      kind: "OBSTACLE_CONFIDENCE",
      level: "CAUTION",
      riskDetected: "Secondary object detected near Route C with low confidence.",
      currentValue: "61% confidence",
      allowedLimit: "≥ 75% for autonomous rerouting",
      agentRecommendation: "Hold position and request operator review.",
      proposedAdjustment: "Re-scan the corridor and use the conservative alternate route.",
    };
    const waitToken = approvalWaitTokenRef.current + 1;
    approvalWaitTokenRef.current = waitToken;
    demoApprovalDecisionRef.current = null;
    setFlightModeOverride("HOLD");
    const baseApproval: ApprovalRequest = {
      category: "Low-confidence obstacle",
      reason: "Secondary object detected near Route C corridor at 61% confidence.",
      recommendedAction: "Hold position and re-scan before approving reroute.",
      requestId: null,
      status: "SENDING",
      transport: "SLACK",
      missionId,
      droneName: selectedDrone,
      proposedAlternative: risk.proposedAdjustment,
      routeImpact: "Conservative reroute may add approximately 2 minutes.",
      statusMessage: "Creating Slack review for a low-confidence obstacle.",
      risks: [risk],
    };
    setApproval(baseApproval);
    pushCommand("Hold position");
    setSlackConnectionState("loading");
    pushIntegrationEvent("Agent", "Low-confidence obstacle triggered CAUTION hold", "Completed");

    const initialApproval = await requestSlackApproval({
      idempotencyKey: `${missionId}:low-confidence-obstacle:${Date.now()}`,
      missionId,
      droneName: selectedDrone,
      currentStatus: "HOLDING safely",
      coordinates: {
        lat: dronePosition.lat,
        lng: dronePosition.lng,
        altitudeM: dronePosition.altitude,
      },
      reason: baseApproval.reason,
      risks: [risk],
      proposedAlternative: risk.proposedAdjustment,
      routeImpact: baseApproval.routeImpact ?? "Conservative reroute",
      etaImpact: "Estimated ETA +2 min.",
    });
    if (approvalWaitTokenRef.current !== waitToken) return;
    setApproval(toUiApproval(baseApproval, initialApproval));
    setSlackConnectionState(initialApproval.transport === "SLACK" ? "success" : "error");
    if (initialApproval.transport === "DEMO_FALLBACK") {
      pushIntegrationEvent("Slack", initialApproval.statusMessage, "Failed");
      return;
    }

    pushIntegrationEvent("Slack", "Low-confidence obstacle review requested", "Completed");
    const finalApproval = await waitForApprovalResolution(
      initialApproval,
      baseApproval,
      () => approvalWaitTokenRef.current === waitToken,
    );
    if (approvalWaitTokenRef.current !== waitToken) return;
    setApproval(toUiApproval(baseApproval, finalApproval));
    if (finalApproval.status === "APPROVED") {
      setApproval(null);
      setFlightModeOverride(null);
      pushCommand("Apply approved conservative adjustment");
      pushIntegrationEvent("Operator", "Low-confidence obstacle adjustment approved", "Completed");
    } else if (finalApproval.status === "REJECTED") {
      setCurrentStatus("ABORTED");
      setEtaLabel("Aborted");
      pushCommand("Abort mission");
      pushIntegrationEvent("Operator", "Mission rejected after obstacle review", "Failed");
    } else {
      setFlightModeOverride("HOLD");
      pushCommand("Maintain safe hold");
      pushIntegrationEvent("Operator", finalApproval.statusMessage, "Completed");
    }
  }

  function resolveApproval(decision: ApprovalDecision) {
    if (!approval) {
      return;
    }

    const nextStatus =
      decision === "approve"
        ? "APPROVED"
        : decision === "hold"
          ? "HELD"
          : "REJECTED";
    demoApprovalDecisionRef.current = decision;
    setApproval((current) =>
      current
        ? {
            ...current,
            status: nextStatus,
            operatorName: "Demo operator",
            statusMessage:
              decision === "approve"
                ? "DEMO_FALLBACK approved the agent-recommended adjustment."
                : decision === "hold"
                  ? "DEMO_FALLBACK kept the drone safely paused."
                  : "DEMO_FALLBACK rejected and aborted the mission.",
          }
        : null,
    );

    if (isLaunching || isRunningPreflight) {
      return;
    }

    if (decision === "approve") {
      setApproval(null);
      setFlightModeOverride(null);
      pushCommand("Resume flight");
      pushIntegrationEvent("Operator", "DEMO_FALLBACK alternate approved", "Completed");
    } else if (decision === "hold") {
      setFlightModeOverride("HOLD");
      pushCommand("Maintain safe hold");
      pushIntegrationEvent("Operator", "DEMO_FALLBACK hold selected", "Completed");
    } else {
      setCurrentStatus("ABORTED");
      setFlightModeOverride("HOLD");
      setEtaLabel("Aborted");
      pushCommand("Abort mission");
      pushIntegrationEvent("Operator", "DEMO_FALLBACK mission rejected", "Failed");
    }
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
        <TopBar
          airtableState={selectedMission?.memoryFetchState ?? "IDLE"}
          liveEnabled={liveEnabled}
          onNewMission={() => setShowNewMissionModal(true)}
          onTopTabChange={handleTopTabChange}
          slackState={slackConnectionState}
          topTab={topTab}
        />

        {/* Both tabs stay mounted so the 3D map (and its animation state) survives
            switching between Mission Planning and Live Mission — only visibility toggles. */}
        <div className={cn("contents", topTab !== "planning" && "hidden")}>
          <MissionPlanningTab
            approval={approval}
            isLaunching={isLaunching}
            isRunningPreflight={isRunningPreflight}
            missions={missions}
            onCreatePreset={handleCreatePreset}
            onLaunchMission={handleLaunchMission}
            onMemoryModeChange={handleMemoryModeChange}
            onNewMission={() => setShowNewMissionModal(true)}
            onNextStep={handleNextStep}
            onResolveApproval={resolveApproval}
            onReset={resetDemo}
            onRunPreflight={handleRunPreflight}
            onSelectMission={setSelectedMissionId}
            onWeatherModeChange={handleWeatherModeChange}
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
            plannedSpeedMph={selectedMission?.plan?.speedMph ?? null}
            routeProgress={routeProgress}
            routeStatuses={routeStatuses}
            selectedDrone={selectedDrone}
            selectedRoute={selectedRoute}
            weather={selectedMission?.weather ?? null}
            weatherEvaluation={selectedMission?.weatherEvaluation ?? null}
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

function estimatedRemainingEtaLabel(mission: Mission, progress: number): string {
  const plannedEta = routeEtaMinutes(mission.selectedRoute) + mission.etaDeltaMin;
  const remaining = Math.max(1, Math.ceil(plannedEta * (1 - progress)));
  return progress >= 0.98 ? "<1 min" : `${remaining} min`;
}

function adjustedAnimationDuration(mission: Mission, baseDurationMs: number): number {
  const plannedSpeed = mission.cruiseSpeedMph ?? BASE_CRUISE_SPEED_MPH;
  return Math.round(baseDurationMs * (BASE_CRUISE_SPEED_MPH / plannedSpeed));
}

function applyApprovedCautionAdjustments(
  mission: Mission,
  review: MissionRiskReview,
): Mission {
  const switchFromRouteA = review.conditions.some(
    (condition) => condition.id === "restricted-airspace-proximity",
  );
  const routeBEligible = mission.airspaceEval?.routeResults.some(
    (route) => route.id === "B" && route.eligible,
  );
  if (!switchFromRouteA || !routeBEligible || !mission.routeEval) return mission;

  return {
    ...mission,
    selectedRoute: "B",
    routeEval: mission.routeEval.map((route) => ({
      ...route,
      status:
        route.id === "B"
          ? "selected"
          : route.id === "A"
            ? "warning"
            : route.status === "selected"
              ? "candidate"
              : route.status,
      reason:
        route.id === "B"
          ? "Selected after CAUTION approval to increase restricted-airspace margin."
          : route.reason,
    })),
  };
}

interface CreateSlackApprovalPayload {
  idempotencyKey: string;
  missionId: string;
  droneName: string;
  currentStatus: string;
  coordinates: {
    lat: number;
    lng: number;
    altitudeM: number;
  };
  reason: string;
  risks: MissionRiskCondition[];
  proposedAlternative: string;
  routeImpact: string;
  etaImpact: string;
}

async function requestSlackApproval(
  payload: CreateSlackApprovalPayload,
): Promise<SlackApprovalApiResponse> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch("/api/slack/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (isSlackApprovalApiResponse(data)) return data;
    } catch {
      // A retry uses the same idempotency key, so the server cannot send a
      // second Slack message if the first response was lost.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const now = new Date();
  return {
    requestId: window.crypto.randomUUID(),
    status: "SLACK_API_FAILED",
    transport: "DEMO_FALLBACK",
    missionId: payload.missionId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
    statusMessage:
      "Slack approval endpoint could not be reached after an idempotent retry. Use DEMO_FALLBACK controls.",
    duplicate: false,
  };
}

async function pollSlackApproval(
  requestId: string,
  previous: SlackApprovalApiResponse,
): Promise<SlackApprovalApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `/api/slack/approval?requestId=${encodeURIComponent(requestId)}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    return isSlackApprovalApiResponse(data) ? data : previous;
  } catch {
    if (Date.now() >= new Date(previous.expiresAt).getTime()) {
      return {
        ...previous,
        status: "TIMED_OUT",
        statusMessage:
          "Approval polling did not recover before the deadline. The drone remains safely paused; no approval was inferred.",
      };
    }
    return {
      ...previous,
      statusMessage:
        "Temporarily unable to poll the approval endpoint. The drone remains safely paused.",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function toUiApproval(
  base: ApprovalRequest,
  response: SlackApprovalApiResponse,
): ApprovalRequest {
  return {
    ...base,
    requestId: response.requestId,
    status: response.status,
    transport: response.transport,
    expiresAt: response.expiresAt,
    operatorName: response.operatorName,
    statusMessage: response.statusMessage,
  };
}

function isSlackApprovalApiResponse(
  value: unknown,
): value is SlackApprovalApiResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SlackApprovalApiResponse>;
  const statuses = [
    "SENDING",
    "PENDING",
    "APPROVED",
    "HELD",
    "REJECTED",
    "TIMED_OUT",
    "SLACK_UNAVAILABLE",
    "SLACK_API_FAILED",
    "SLACK_UPDATE_FAILED",
  ];
  return Boolean(
    typeof candidate.requestId === "string" &&
      candidate.status &&
      statuses.includes(candidate.status) &&
      (candidate.transport === "SLACK" ||
        candidate.transport === "DEMO_FALLBACK") &&
      typeof candidate.missionId === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.expiresAt === "string" &&
      typeof candidate.statusMessage === "string" &&
      typeof candidate.duplicate === "boolean",
  );
}

async function loadMissionMemories(mission: Mission): Promise<MemoryApiResponse> {
  if (mission.memoryMode === "DEMO_FALLBACK") {
    const memories = readDemoFallbackMemories();
    return {
      status: "SUCCESS",
      memories,
      message: `${memories.length} active localStorage DEMO_FALLBACK memor${memories.length === 1 ? "y" : "ies"} loaded; this is not Airtable data.`,
      source: "DEMO_FALLBACK",
    };
  }
  return requestMemoryApi("GET");
}

async function saveMissionMemory(
  mission: Mission,
  memory: OperationalMemory,
): Promise<MemoryApiResponse> {
  if (mission.memoryMode === "DEMO_FALLBACK") {
    const existing = readDemoFallbackMemories();
    const duplicate = existing.find((candidate) => isDuplicateDemoMemory(candidate, memory));
    const saved: OperationalMemory = duplicate ?? {
      ...memory,
      dataSource: "DEMO_FALLBACK",
      airtableStatus: "fallback",
    };
    if (!duplicate) {
      window.localStorage.setItem(memoryStorageKey, JSON.stringify([...existing, saved]));
    }
    return {
      status: "SUCCESS",
      memories: [saved],
      message: duplicate
        ? `Duplicate prevented in localStorage DEMO_FALLBACK; using ${duplicate.id}.`
        : `${saved.id} saved to localStorage DEMO_FALLBACK; this is not Airtable data.`,
      source: "DEMO_FALLBACK",
      duplicate: Boolean(duplicate),
    };
  }
  return requestMemoryApi("POST", memory);
}

async function requestMemoryApi(
  method: "GET" | "POST",
  memory?: OperationalMemory,
): Promise<MemoryApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);

  try {
    const response = await fetch("/api/memory", {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ memory }) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return memoryFailure("API_FAILURE", `Memory endpoint returned HTTP ${response.status}.`);
    }
    const data: unknown = await response.json();
    return isMemoryApiResponse(data)
      ? data
      : memoryFailure("INVALID_RESPONSE", "Memory endpoint returned an invalid response.");
  } catch (error) {
    return error instanceof Error && error.name === "AbortError"
      ? memoryFailure("TIMEOUT", "Memory endpoint timed out.")
      : memoryFailure("API_FAILURE", "Memory endpoint could not be reached.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function readDemoFallbackMemories(): OperationalMemory[] {
  const raw = window.localStorage.getItem(memoryStorageKey);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const valid = candidates.filter(isOperationalMemory);
    const now = Date.now();
    const normalized = valid.map((item) =>
      new Date(item.expiresAt).getTime() <= now ? { ...item, status: "Inactive" as const } : item,
    );
    window.localStorage.setItem(memoryStorageKey, JSON.stringify(normalized));
    return normalized
      .filter((item) => isMemoryActive(item))
      .map((item) => ({ ...item, dataSource: "DEMO_FALLBACK", airtableStatus: "fallback" }));
  } catch {
    window.localStorage.removeItem(memoryStorageKey);
    return [];
  }
}

function isDuplicateDemoMemory(existing: OperationalMemory, incoming: OperationalMemory) {
  const latScale = 111_320;
  const lngScale = latScale * Math.cos(((existing.latitude + incoming.latitude) / 2) * (Math.PI / 180));
  const distanceM = Math.hypot(
    (existing.latitude - incoming.latitude) * latScale,
    (existing.longitude - incoming.longitude) * lngScale,
  );
  const overlappingWindow =
    new Date(existing.createdAt).getTime() < new Date(incoming.expiresAt).getTime() &&
    new Date(existing.expiresAt).getTime() > new Date(incoming.createdAt).getTime();
  return (
    existing.hazardType.toLowerCase() === incoming.hazardType.toLowerCase() &&
    distanceM <= 30 &&
    overlappingWindow &&
    isMemoryActive(existing)
  );
}

function isMemoryApiResponse(value: unknown): value is MemoryApiResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MemoryApiResponse>;
  const statuses = ["SUCCESS", "TIMEOUT", "MISSING_KEY", "INVALID_RESPONSE", "API_FAILURE"];
  return Boolean(
    candidate.status &&
      statuses.includes(candidate.status) &&
      typeof candidate.message === "string" &&
      (candidate.source === "AIRTABLE" || candidate.source === "DEMO_FALLBACK") &&
      Array.isArray(candidate.memories) &&
      candidate.memories.every(isOperationalMemory),
  );
}

function isOperationalMemory(value: unknown): value is OperationalMemory {
  if (!value || typeof value !== "object") return false;
  const memory = value as Partial<OperationalMemory>;
  return Boolean(
    typeof memory.id === "string" &&
      typeof memory.learnedBy === "string" &&
      ["A", "B", "C"].includes(memory.routeId ?? "") &&
      typeof memory.hazardType === "string" &&
      Number.isFinite(memory.latitude) &&
      Number.isFinite(memory.longitude) &&
      Number.isFinite(memory.confidence) &&
      typeof memory.createdAt === "string" &&
      typeof memory.expiresAt === "string" &&
      Array.isArray(memory.altitudeBandM) &&
      memory.altitudeBandM.length === 2 &&
      Number.isFinite(memory.avoidanceRadiusM) &&
      typeof memory.sourceVendor === "string" &&
      typeof memory.sourceMission === "string" &&
      (memory.status === "Active" || memory.status === "Inactive") &&
      (memory.dataSource === "AIRTABLE" || memory.dataSource === "DEMO_FALLBACK"),
  );
}

function memoryFailure(
  status: Exclude<MemoryApiResponse["status"], "SUCCESS">,
  message: string,
): MemoryApiResponse {
  return { status, memories: [], message, source: "AIRTABLE" };
}

async function fetchMissionWeather(mission: Mission): Promise<WeatherResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);

  try {
    const response = await fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickup: {
          label: mission.mapScene.originLabel,
          lat: mission.mapScene.origin.lat,
          lng: mission.mapScene.origin.lng,
        },
        dropOff: {
          label: mission.mapScene.destinationLabel,
          lat: mission.mapScene.destination.lat,
          lng: mission.mapScene.destination.lng,
        },
        mode: mission.weatherMode,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return makeFallbackWeatherResponse("API_FAILURE", `Weather endpoint returned HTTP ${response.status}.`);
    }

    const data: unknown = await response.json();
    return isWeatherResponse(data)
      ? data
      : makeFallbackWeatherResponse("INVALID_RESPONSE", "Weather endpoint returned an invalid response.");
  } catch (error) {
    return error instanceof Error && error.name === "AbortError"
      ? makeFallbackWeatherResponse("TIMEOUT", "Weather endpoint timed out.")
      : makeFallbackWeatherResponse("API_FAILURE", "Weather endpoint could not be reached.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function isWeatherResponse(value: unknown): value is WeatherResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WeatherResponse>;
  const weather = candidate.weather;
  const validStatuses = ["SUCCESS", "TIMEOUT", "INVALID_RESPONSE", "MISSING_API_KEY", "RATE_LIMIT", "API_FAILURE"];

  return Boolean(
    candidate.status &&
      validStatuses.includes(candidate.status) &&
      typeof candidate.message === "string" &&
      weather &&
      (weather.dataSource === "LIVE" || weather.dataSource === "DEMO_FALLBACK") &&
      Number.isFinite(weather.windMph) &&
      Number.isFinite(weather.gustMph) &&
      Number.isFinite(weather.windDirectionDeg) &&
      Number.isFinite(weather.temperatureF) &&
      Number.isFinite(weather.visibilityMiles) &&
      typeof weather.condition === "string" &&
      typeof weather.updatedAt === "string" &&
      weather.locations?.pickup &&
      weather.locations?.dropOff,
  );
}

function TopBar({
  airtableState,
  liveEnabled,
  onNewMission,
  onTopTabChange,
  slackState,
  topTab,
}: {
  airtableState: MemoryFetchState;
  liveEnabled: boolean;
  onNewMission: () => void;
  onTopTabChange: (tab: TopTab) => void;
  slackState: "idle" | "loading" | "success" | "error";
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
          <ConnectionIndicator
            icon={Database}
            label="Airtable"
            state={
              airtableState === "SUCCESS"
                ? "success"
                : airtableState === "LOADING"
                  ? "loading"
                  : airtableState === "IDLE"
                    ? "idle"
                    : "error"
            }
          />
          <ConnectionIndicator icon={Radio} label="Slack" state={slackState} />
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

function ConnectionIndicator({
  icon: Icon,
  label,
  state = "success",
}: {
  icon: LucideIcon;
  label: string;
  state?: "idle" | "loading" | "success" | "error";
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-black">
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          state === "success"
            ? "text-emerald-600"
            : state === "error"
              ? "text-red-600"
              : state === "loading"
                ? "text-amber-500"
                : "text-neutral-400",
        )}
      />
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
  onFrame?: (progress: number) => void,
  shouldContinue: () => boolean = () => true,
) {
  return new Promise<void>((resolve) => {
    const startedAt = performance.now();

    function tick(now: number) {
      if (!shouldContinue()) {
        resolve();
        return;
      }

      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const routeProgress = from + (to - from) * progress;
      setDronePosition(interpolateRoute(routes, routeId, routeProgress));
      setProgress(routeProgress);
      onFrame?.(routeProgress);

      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }

      resolve();
    }

    window.requestAnimationFrame(tick);
  });
}

function animateAltitudeAtCurrentPosition(
  altitudeM: number,
  durationMs: number,
  setDronePosition: Dispatch<SetStateAction<GeoPoint3D>>,
  shouldContinue: () => boolean = () => true,
) {
  return new Promise<void>((resolve) => {
    const startedAt = performance.now();
    let startAltitude: number | null = null;

    function tick(now: number) {
      if (!shouldContinue()) {
        resolve();
        return;
      }

      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      setDronePosition((current) => {
        startAltitude ??= current.altitude;
        return { ...current, altitude: startAltitude + (altitudeM - startAltitude) * progress };
      });

      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }

      resolve();
    }

    window.requestAnimationFrame(tick);
  });
}
