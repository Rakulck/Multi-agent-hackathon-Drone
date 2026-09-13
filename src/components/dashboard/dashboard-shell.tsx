"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Database, Radio, type LucideIcon } from "lucide-react";
import { dispatchOrigin } from "@/data/demo-routes";
import { makeFallbackWeatherResponse } from "@/data/demo-weather";
import { MissionPlanningTab } from "@/components/dashboard/mission-planning-tab";
import { NewMissionModal } from "@/components/dashboard/new-mission-modal";
import { LiveMissionTab } from "@/components/live-mission/live-mission-tab";
import {
  TwilioToastViewport,
  type TwilioToastItem,
} from "@/components/live-mission/twilio-toast-viewport";
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
  isMemoryFetchSuccess,
  makeInitialFleet,
  makeInitialRouteStatuses,
  markMemoryUsed,
  memoryStorageKey,
  pickProvisionalDrone,
  primaryDropOffName,
  resetMissionCounter,
  settleLastIntegrationEvent,
} from "@/lib/mission-machine";
import { defaultMapScene } from "@/lib/map/route-warp";
import { validateAlternativeDropOff } from "@/lib/customer-dropoff-safety";
import { buildCustomerMessage } from "@/lib/customer-message-templates";
import { cn } from "@/lib/utils";
import {
  preflightStepOrder,
  type ApprovalDecision,
  type ApprovalRequest,
  type CustomerCommunicationSnapshot,
  type CustomerMessageEventType,
  type DemoRoute,
  type FleetDrone,
  type FlightMode,
  type GeoPoint3D,
  type GeminiObstacleApiResponse,
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
  type SlackApprovalKind,
  type StepEvidence,
  type TopTab,
  type WeatherMode,
  type WeatherResponse,
  type VisionAnalysisPhase,
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
  const [visionAnalysis, setVisionAnalysis] =
    useState<GeminiObstacleApiResponse | null>(null);
  const [visionPhase, setVisionPhase] =
    useState<VisionAnalysisPhase>("IDLE");
  const [customerCommunication, setCustomerCommunication] =
    useState<CustomerCommunicationSnapshot | null>(null);
  const [twilioToasts, setTwilioToasts] = useState<TwilioToastItem[]>([]);
  const runTokenRef = useRef(0);
  const approvalWaitTokenRef = useRef(0);
  const demoApprovalDecisionRef = useRef<ApprovalDecision | null>(null);
  const customerCommunicationRef =
    useRef<CustomerCommunicationSnapshot | null>(null);
  const shownTwilioToastKeysRef = useRef(new Set<string>());

  const selectedMission = missions.find((mission) => mission.id === selectedMissionId) ?? null;
  const liveEnabled = Boolean(selectedMission && liveEnabledLifecycles.includes(selectedMission.lifecycle));

  useEffect(() => {
    customerCommunicationRef.current = customerCommunication;
  }, [customerCommunication]);

  useEffect(() => {
    if (!selectedMissionId || !hasVisitedLive) return;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/twilio/mission?missionId=${encodeURIComponent(selectedMissionId)}`,
          { cache: "no-store" },
        );
        const data: unknown = await response.json();
        if (!response.ok || !isCustomerCommunicationSnapshot(data)) return;
        customerCommunicationRef.current = data;
        setCustomerCommunication(data);
        setMissions((current) =>
          current.map((mission) =>
            mission.id === selectedMissionId
              ? { ...mission, customerCommunication: data }
              : mission,
          ),
        );
      } catch {
        // Communication polling is non-critical; flight state is unchanged.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => window.clearInterval(timer);
  }, [hasVisitedLive, selectedMissionId]);

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

  const dismissTwilioToast = useCallback((id: string) => {
    setTwilioToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  function beginTwilioToast(
    mission: Mission,
    eventType: CustomerMessageEventType,
    eta?: string,
  ): string | null {
    const toastKey = `${mission.id}:${eventType}`;
    if (shownTwilioToastKeysRef.current.has(toastKey)) return null;
    shownTwilioToastKeysRef.current.add(toastKey);
    const currentCommunication =
      customerCommunicationRef.current?.missionId === mission.id
        ? customerCommunicationRef.current
        : mission.customerCommunication;
    const toast: TwilioToastItem = {
      id: toastKey,
      missionId: mission.id,
      eventType,
      message: buildCustomerMessage({
        eventType,
        missionId: mission.id,
        primaryDropOffName: primaryDropOffName(mission.input),
        finalDropOffName:
          currentCommunication?.updatedDropOff ??
          primaryDropOffName(mission.input),
        eta,
      }),
      recipientMasked:
        currentCommunication?.recipientMasked ??
        mission.input.recipientPhoneMasked ??
        "Unavailable",
      status: "sending",
      transport: currentCommunication?.transport ?? "DEMO_FALLBACK",
    };
    setTwilioToasts((current) => [...current, toast]);
    return toastKey;
  }

  function updateTwilioToast(
    toastId: string | null,
    update: Partial<
      Pick<TwilioToastItem, "message" | "status" | "transport" | "recipientMasked">
    >,
  ) {
    if (!toastId) return;
    setTwilioToasts((current) =>
      current.map((toast) =>
        toast.id === toastId ? { ...toast, ...update } : toast,
      ),
    );
  }

  async function sendCustomerUpdate(
    mission: Mission,
    eventType: CustomerMessageEventType,
    options?: {
      eta?: string;
      safetyContext?: {
        primaryPoint: GeoPoint3D;
        blockedZones: Array<{ center: GeoPoint3D; radiusM: number }>;
        routeEligible: boolean;
        weatherSafe: boolean;
        batteryReservePercent: number;
      };
    },
  ): Promise<CustomerCommunicationSnapshot | null> {
    const toastId = beginTwilioToast(mission, eventType, options?.eta);
    pushIntegrationEvent(
      "Mission Agent",
      `${eventType.replaceAll("_", " ")} customer update prepared`,
      "Completed",
    );
    try {
      const response = await fetch("/api/twilio/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          eventType,
          eta: options?.eta,
          safetyContext: options?.safetyContext,
        }),
        cache: "no-store",
      });
      const data: unknown = await response.json();
      if (!response.ok || !isCustomerMessageApiResponse(data)) {
        throw new Error("Invalid customer communication response.");
      }
      const communication = data.communication;
      customerCommunicationRef.current = communication;
      setCustomerCommunication(communication);
      updateMission(mission.id, (current) => ({
        ...current,
        customerCommunication: communication,
      }));
      const event = communication.events.find(
        (candidate) => candidate.eventType === eventType,
      );
      updateTwilioToast(toastId, {
        message: data.displayMessage,
        recipientMasked: communication.recipientMasked,
        status: event?.status === "failed" ? "failed" : "sent",
        transport: event?.transport ?? communication.transport,
      });
      pushIntegrationEvent(
        "Twilio",
        event?.status === "failed"
          ? `DEMO_FALLBACK: ${eventType.replaceAll("_", " ")} was not sent`
          : data.duplicate
            ? `${eventType.replaceAll("_", " ")} already recorded; duplicate SMS prevented`
            : `${eventType.replaceAll("_", " ")} update ${event?.status ?? "queued"}`,
        event?.status === "failed" ? "Failed" : "Completed",
      );
      return communication;
    } catch {
      updateTwilioToast(toastId, {
        status: "failed",
        transport: "DEMO_FALLBACK",
      });
      pushIntegrationEvent(
        "Twilio",
        `DEMO_FALLBACK: ${eventType.replaceAll("_", " ")} endpoint unavailable; no SMS represented as sent`,
        "Failed",
      );
      return null;
    }
  }

  async function handleCreateMission(input: NewMissionInput) {
    const recipientPhone = input.recipientPhone;
    const mission = createMission({
      ...input,
      recipientPhone: undefined,
      recipientPhoneMasked: input.useDemoRecipient
        ? undefined
        : maskPhoneForUi(recipientPhone),
    });
    const communication = await registerCustomerCommunication(
      mission,
      recipientPhone,
    );
    mission.customerCommunication = communication;
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
    const nextStepId = preflightStepOrder.find(
      (id) => selectedMission.steps[id].status === "Waiting",
    );
    if (
      nextStepId === "WEATHER" &&
      selectedMission.activeStepId !== "WEATHER"
    ) {
      updateMission(selectedMission.id, (mission) => ({
        ...mission,
        activeStepId: "WEATHER",
        steps: {
          ...mission.steps,
          WEATHER: {
            ...mission.steps.WEATHER,
            evaluation: [
              "Select Live, Safe, or Moderate to preview the weather decision.",
            ],
            decision: "Choose a weather mode before continuing.",
            source: ["OpenWeather", "Mission Agent"],
            summary: "Waiting for weather mode selection.",
          },
        },
      }));
      return;
    }
    void advancePreflightStep(selectedMission.id);
  }

  async function handleWeatherModeChange(mode: WeatherMode) {
    if (!selectedMission || selectedMission.steps.WEATHER.status !== "Waiting" || isRunningPreflight) {
      return;
    }
    const preview: Record<
      Exclude<WeatherMode, "UNSAFE">,
      Pick<StepEvidence, "input" | "evaluation" | "decision" | "source" | "summary">
    > = {
      LIVE: {
        input: ["Live weather selected."],
        evaluation: ["OpenWeather will be queried for the pickup and drop-off locations."],
        decision: "Next Step will fetch live conditions and apply deterministic limits.",
        source: ["OpenWeather", "Mission Agent"],
        summary: "Live weather ready to evaluate.",
      },
      SAFE: {
        input: ["Controlled Safe weather selected."],
        evaluation: ["Wind and visibility will remain comfortably within drone limits."],
        decision: "Next Step will evaluate the safe demo snapshot; no weather approval is expected.",
        source: ["Controlled demo weather", "Mission Agent"],
        summary: "Safe weather ready to evaluate.",
      },
      MODERATE: {
        input: ["Controlled Moderate weather selected."],
        evaluation: ["Wind margin will trigger a CAUTION review and reduced-speed recommendation."],
        decision: "Next Step will evaluate Moderate weather; Slack approval will be required before launch.",
        source: ["Controlled demo weather", "Slack", "Mission Agent"],
        summary: "Moderate weather selected · Slack approval required.",
      },
    };
    if (mode === "UNSAFE") return;
    if (mode === "LIVE") {
      approvalWaitTokenRef.current += 1;
      setApproval(null);
      const missionId = selectedMission.id;
      updateMission(missionId, (mission) => ({
        ...mission,
        weatherMode: "LIVE",
        weatherApprovalGranted: false,
        weatherFetchState: "LOADING",
        weatherFetchMessage: "Fetching live OpenWeather conditions…",
        steps: {
          ...mission.steps,
          WEATHER: {
            ...mission.steps.WEATHER,
            input: ["Fetching live pickup and drop-off weather now…"],
            evaluation: ["Contacting OpenWeather."],
            decision: "Checking whether live weather is available.",
            source: ["OpenWeather LIVE"],
            status: "Evaluating",
            summary: "Fetching live weather.",
          },
        },
      }));
      const response = await fetchMissionWeather({
        ...selectedMission,
        weatherMode: "LIVE",
      });
      const liveAvailable = response.status === "SUCCESS";
      const evaluation = liveAvailable
        ? evaluateWeatherForDrones(
            selectedMission.fleetEligibility ?? [],
            response.weather,
          )
        : null;
      const liveSuitable = Boolean(
        liveAvailable && evaluation && !evaluation.paused,
      );
      updateMission(missionId, (mission) => ({
        ...mission,
        weatherFetchState: response.status,
        weatherFetchMessage: response.message,
        weather: liveAvailable ? response.weather : null,
        weatherEvaluation: evaluation,
        steps: {
          ...mission.steps,
          WEATHER: liveAvailable && evaluation
            ? {
                ...buildWeatherStepEvidence({
                  weather: response.weather,
                  evaluation,
                  fetchState: response.status,
                  fetchMessage: response.message,
                }),
                status: "Waiting",
                decision: liveSuitable
                  ? "Live weather is suitable. Select Next Step to continue with these conditions."
                  : "Live weather is not suitable for any eligible drone. Choose Safe or Moderate to continue.",
                summary: liveSuitable
                  ? "Live weather ready to evaluate."
                  : "Live weather unsuitable · choose Safe or Moderate.",
              }
            : {
                ...mission.steps.WEATHER,
                input: [`Live weather request: ${response.status}.`],
                evaluation: [
                  "Live OpenWeather conditions are not available.",
                  "No fallback mode was selected automatically.",
                ],
                decision:
                  "Choose Safe or Moderate to continue the weather step.",
                source: ["OpenWeather LIVE", "Mission Agent"],
                status: "Waiting",
                summary: "Live weather unavailable · choose Safe or Moderate.",
              },
        },
      }));
      return;
    }
    if (mode === "MODERATE") {
      const missionId = selectedMission.id;
      const waitToken = approvalWaitTokenRef.current + 1;
      approvalWaitTokenRef.current = waitToken;
      demoApprovalDecisionRef.current = null;
      const response = await fetchMissionWeather({
        ...selectedMission,
        weatherMode: "MODERATE",
      });
      const evaluation = evaluateWeatherForDrones(
        selectedMission.fleetEligibility ?? [],
        response.weather,
      );
      const selectedDrone = evaluation.confirmedDrone;
      if (!selectedDrone) {
        updateMission(missionId, (mission) => ({
          ...mission,
          weatherMode: "MODERATE",
          weatherApprovalGranted: false,
          steps: {
            ...mission.steps,
            WEATHER: {
              ...mission.steps.WEATHER,
              input: ["Controlled Moderate weather selected."],
              evaluation: ["No eligible drone can operate in this scenario."],
              decision: "Moderate weather is not suitable. Choose Safe.",
              source: ["Controlled demo weather", "Mission Agent"],
              status: "Waiting",
              summary: "Moderate weather unsuitable.",
            },
          },
        }));
        return;
      }
      const peak = Math.max(response.weather.windMph, response.weather.gustMph);
      const risk: MissionRiskCondition = {
        id: "moderate-wind-margin",
        kind: "WEATHER_MARGIN",
        level: "CAUTION",
        riskDetected:
          "Wind or gust is close to the selected drone's certified limit.",
        currentValue: `${peak} mph peak (${Math.round((peak / selectedDrone.windLimitMph) * 100)}% utilization)`,
        allowedLimit: `≤ ${selectedDrone.windLimitMph} mph`,
        agentRecommendation: "Approve the reduced-speed weather plan.",
        proposedAdjustment: `Reduce cruise speed to ${evaluation.cruiseSpeedMph} mph; ETA +${evaluation.etaDeltaMin} min.`,
      };
      const baseApproval: ApprovalRequest = {
        category: "Borderline weather",
        reason: risk.riskDetected,
        recommendedAction: risk.proposedAdjustment,
        requestId: null,
        status: "SENDING",
        transport: "SLACK",
        missionId,
        droneName: selectedDrone.model,
        proposedAlternative: risk.proposedAdjustment,
        routeImpact: `Weather speed adjustment; ETA +${evaluation.etaDeltaMin} min.`,
        statusMessage: "Sending concise weather approval to Slack.",
        risks: [risk],
        approvalKind: "GENERAL_CAUTION",
      };
      updateMission(missionId, (mission) => ({
        ...mission,
        weatherMode: "MODERATE",
        weatherApprovalGranted: false,
        weatherFetchState: response.status,
        weatherFetchMessage: response.message,
        weather: response.weather,
        weatherEvaluation: evaluation,
        steps: {
          ...mission.steps,
          WEATHER: {
            ...mission.steps.WEATHER,
            ...preview.MODERATE,
            evaluation: [
              ...preview.MODERATE.evaluation,
              "Sending weather approval to Slack now.",
            ],
            decision: "Waiting for Slack weather approval.",
            status: "Evaluating",
            summary: "Moderate weather · awaiting Slack approval.",
          },
        },
      }));
      const initial = await requestSlackApproval({
        idempotencyKey: `${missionId}:moderate-weather:${response.weather.updatedAt}`,
        missionId,
        droneName: selectedDrone.model,
        currentStatus: "PREFLIGHT WEATHER HOLD",
        coordinates: {
          lat: selectedMission.mapScene.origin.lat,
          lng: selectedMission.mapScene.origin.lng,
          altitudeM: selectedMission.mapScene.origin.altitude,
        },
        reason: risk.riskDetected,
        risks: [risk],
        proposedAlternative: risk.proposedAdjustment,
        routeImpact: baseApproval.routeImpact ?? "Reduced-speed weather plan.",
        etaImpact: `ETA +${evaluation.etaDeltaMin} min.`,
      });
      if (approvalWaitTokenRef.current !== waitToken) return;
      setApproval(toUiApproval(baseApproval, initial));
      setSlackConnectionState(
        initial.transport === "SLACK" ? "success" : "error",
      );
      const final = await waitForApprovalResolution(
        initial,
        baseApproval,
        () => approvalWaitTokenRef.current === waitToken,
      );
      if (approvalWaitTokenRef.current !== waitToken) return;
      const approved = final.status === "APPROVED";
      setApproval(approved ? null : toUiApproval(baseApproval, final));
      updateMission(missionId, (mission) => ({
        ...mission,
        weatherApprovalGranted: approved,
        steps: {
          ...mission.steps,
          WEATHER: {
            ...mission.steps.WEATHER,
            ...preview.MODERATE,
            evaluation: approved
              ? [
                  ...preview.MODERATE.evaluation,
                  `Approved by ${final.operatorName ?? "Slack operator"}.`,
                ]
              : [
                  ...preview.MODERATE.evaluation,
                  "Weather approval was not granted; choose another mode or retry.",
                ],
            decision: approved
              ? "Slack approved the reduced-speed weather plan. Select Next Step."
              : "Moderate weather requires approval. Choose Safe or retry Moderate.",
            status: "Waiting",
            summary: approved
              ? "Moderate weather approved in Slack."
              : "Moderate weather not approved.",
          },
        },
      }));
      return;
    }
    approvalWaitTokenRef.current += 1;
    setApproval(null);
    updateMission(selectedMission.id, (mission) => ({
      ...mission,
      weatherMode: mode,
      weatherApprovalGranted: false,
      weatherFetchState: "IDLE",
      weatherFetchMessage: null,
      weather: null,
      weatherEvaluation: null,
      steps: {
        ...mission.steps,
        WEATHER: {
          ...mission.steps.WEATHER,
          ...preview[mode],
        },
      },
    }));
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
    void createPresetMission(pattern);
  }

  async function createPresetMission(pattern: MissionRun) {
    const mission = createMission(demoPresetInputs[pattern], pattern, {
      isDemoPreset: true,
    });
    mission.customerCommunication = await registerCustomerCommunication(
      mission,
    );
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
        const weatherResponse =
          nextMission.weatherMode === "LIVE" &&
          nextMission.weatherFetchState === "SUCCESS" &&
          nextMission.weather
            ? {
                status: "SUCCESS" as const,
                weather: nextMission.weather,
                message:
                  nextMission.weatherFetchMessage ??
                  "Live OpenWeather conditions already loaded.",
              }
            : await fetchMissionWeather(nextMission);
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
        const airspaceEval = evaluateAirspaceForMission(
          nextMission.selectedRoute,
          {
            controlledDemoPreset:
              nextMission.isDemoPreset &&
              nextMission.pattern === "MISSION_1",
            routeCRequiresAuthorization:
              nextMission.isDemoPreset &&
              nextMission.pattern === "MISSION_2",
          },
        );
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
        const loadedMemoryResponse =
          nextMission.isDemoPreset && nextMission.pattern === "MISSION_1"
            ? {
                status: "SUCCESS_EMPTY" as const,
                memories: [],
                message:
                  "Controlled Mission 1 preset starts with no active Route A crane memory.",
                source: "AIRTABLE" as const,
                presetIsolation: true,
              }
            : await loadMissionMemories(nextMission);
        const memoryResponse: MemoryApiResponse = loadedMemoryResponse;
        const activeMemories =
          isMemoryFetchSuccess(memoryResponse.status)
            ? memoryResponse.memories
            : [];
        const matches =
          isMemoryFetchSuccess(memoryResponse.status)
            ? evaluateMemoriesAgainstRoutes(activeMemories, nextMission.mapScene.routes)
            : [];
        const matchedMemoryIds = new Set(
          matches.filter((match) => match.matched).map((match) => match.memoryId),
        );
        const retrievedMemories = activeMemories.map((item) =>
          nextMission.pattern === "MISSION_2" &&
          nextMission.confirmedDrone &&
          matchedMemoryIds.has(item.id)
            ? markMemoryUsed(item, nextMission.confirmedDrone)
            : item,
        );
        const normalizedResponse = { ...memoryResponse, memories: retrievedMemories };
        const evidence = buildMemoryStepEvidence({
          response: normalizedResponse,
          matches,
          retrievedBy: nextMission.pattern === "MISSION_2" ? nextMission.confirmedDrone : null,
        });
        const failed = !isMemoryFetchSuccess(memoryResponse.status);
        const activeMemory =
          retrievedMemories.find((item) =>
            matches.some((match) => match.memoryId === item.id && match.matched),
          ) ?? null;
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
          primaryDropOff: primaryDropOffName(nextMission.input),
          backupDropOff: "Terrace or Front Entrance (after deterministic validation)",
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
    setVisionAnalysis(null);
    setVisionPhase("IDLE");
    customerCommunicationRef.current = mission.customerCommunication;
    setCustomerCommunication(mission.customerCommunication);
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
    pushIntegrationEvent("Mission Agent", `Approved plan loaded: ${mission.confirmedDrone}, Route ${mission.selectedRoute}, weather, airspace, and memory state`);
    if (mission.weather) {
      pushIntegrationEvent(
        "OpenWeather",
        `${mission.weather.dataSource}: ${mission.weather.gustMph} mph gust; ${mission.weatherEvaluation?.severity ?? "UNKNOWN"} decision applied`,
        "Completed",
      );
    }
    await sendCustomerUpdate(mission, "DISPATCHED_TO_PICKUP");
    if (!isRunActive(runToken)) return;
    await wait(350);
    await sendCustomerUpdate(mission, "PACKAGE_PICKED_UP");
    if (!isRunActive(runToken)) return;

    const outcome: "COMPLETED" | "HELD" | "REJECTED" | "RETURNING_HOME" =
      mission.pattern === "MISSION_1"
        ? (await runLiveMission1(mission, runToken)) ?? "HELD"
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
    if (outcome === "RETURNING_HOME") {
      updateMission(mission.id, (current) => ({
        ...current,
        lifecycle: "RETURNING_HOME",
        approvalRequired: false,
      }));
      setIsLaunching(false);
      return;
    }
    updateMission(mission.id, (current) => ({ ...current, lifecycle: "DELIVERED" }));
    await sendCustomerUpdate(mission, "DELIVERED");
    setIsLaunching(false);
  }

  function isRunActive(runToken: number) {
    return runTokenRef.current === runToken;
  }

  async function runLiveMission1(mission: Mission, runToken: number) {
    const droneModel = mission.confirmedDrone ?? "Atlas HeavyLift";
    const routes = mission.mapScene.routes;
    const flightRoute: RouteId = mission.selectedRoute ?? "A";

    await wait(500);
    if (!isRunActive(runToken)) return;
    await animateRoute(
      routes,
      flightRoute,
      0,
      0.5,
      adjustedAnimationDuration(mission, 2400),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return;

    const sourceDrone = fleet.find((drone) => drone.model === droneModel);
    const currentPosition = interpolateRoute(routes, flightRoute, 0.5);
    setCurrentStatus("OBSTACLE DETECTED");
    setFlightModeOverride("HOLD");
    setEtaLabel("Holding");
    pushCommand("Hold position");
    setVisionPhase("ANALYZING");
    pushIntegrationEvent(
      "Drone Sensor",
      "Simulated camera frame captured at the configured waypoint",
      "Completed",
    );
    pushIntegrationEvent(
      mission.memoryMode === "DEMO_FALLBACK"
        ? "Drone Sensor"
        : "Gemini 2.5 Flash",
      mission.memoryMode === "DEMO_FALLBACK"
        ? "Running explicitly labelled DEMO_FALLBACK perception"
        : "Analyzing the bundled camera frame",
    );

    const analysis = await requestGeminiObstacleAnalysis({
      mission,
      droneModel,
      sourceVendor: sourceDrone?.vendor ?? "Unknown vendor",
      routeId: flightRoute,
      position: currentPosition,
    });
    if (!isRunActive(runToken)) return;
    setVisionAnalysis(analysis);
    setVisionPhase(
      analysis.status === "SUCCESS" ? "COMPLETE" : "FAILED",
    );

    if (
      analysis.status !== "SUCCESS" ||
      analysis.decision.action === "GEMINI_API_FAILURE"
    ) {
      pushIntegrationEvent("Gemini 2.5 Flash", analysis.message, "Failed");
      pushIntegrationEvent(
        "Deterministic Safety Engine",
        "GEMINI_API_FAILURE: safe hold; no route approval or memory write",
        "Completed",
      );
      return "HELD";
    }

    pushIntegrationEvent(
      analysis.source === "GEMINI" ? "Gemini 2.5 Flash" : "Drone Sensor",
      `${analysis.source === "GEMINI" ? "Gemini 2.5 Flash observation" : "DEMO_FALLBACK observation (not Gemini)"}: ${
        analysis.observation?.obstacleDetected
          ? `${analysis.observation.obstacleType.replaceAll("_", " ")} at ${Math.round(analysis.observation.confidence * 100)}% confidence`
          : "no obstacle detected"
      }`,
      "Completed",
    );
    pushIntegrationEvent(
      "Deterministic Safety Engine",
      `${analysis.decision.action.replaceAll("_", " ")}: ${analysis.decision.reason}`,
      "Completed",
    );

    if (analysis.decision.action === "CONTINUE") {
      setCurrentStatus("IN FLIGHT");
      setFlightModeOverride(null);
      setHazardVisible(false);
      pushCommand("Continue mission");
      await sendCustomerUpdate(mission, "APPROACHING_DESTINATION", {
        eta: estimatedRemainingEtaLabel(mission, 0.82),
      });
      if (!isRunActive(runToken)) return;
      await animateRoute(
        routes,
        flightRoute,
        0.5,
        1,
        adjustedAnimationDuration(mission, 2200),
        setDronePosition,
        setRouteProgress,
        (progress) => updateLiveTelemetry(mission, progress),
        () => isRunActive(runToken),
      );
      if (!isRunActive(runToken)) return;
      setCurrentStatus("DELIVERED");
      setEtaLabel("Delivered");
      setFleet((current) =>
        current.map((drone) =>
          drone.model === droneModel
            ? { ...drone, status: "Available" }
            : drone,
        ),
      );
      settleIntegrationFlow();
      return "COMPLETED";
    }

    setHazardVisible(true);
    setLiveBattery((current) => (current === null ? null : current - 2));
    if (analysis.decision.action === "HOLD_FOR_HUMAN_REVIEW") {
      const reviewOutcome = await requestVisionHumanReview(
        mission,
        analysis,
        currentPosition,
        runToken,
      );
      if (reviewOutcome !== "APPROVED" || !isRunActive(runToken)) {
        return reviewOutcome === "REJECTED" ? "REJECTED" : "HELD";
      }
    }

    let savedMemory: OperationalMemory | null = null;
    let liveMitigation:
      | "ADJUST_ALTITUDE"
      | "CHOOSE_ALTERNATE_ROUTE" = "ADJUST_ALTITUDE";
    if (analysis.decision.action === "REROUTE") {
      if (!analysis.memory || !analysis.observation) {
        return "HELD";
      }
      setMemory(analysis.memory);
      setRouteStatuses({
        A: flightRoute === "A" ? "blocked" : "candidate",
        B: "candidate",
        C: "candidate",
      });
      pushCommand(`Reject Route ${flightRoute}`);
      const liveApproval = await requestLiveObstacleApproval(
        mission,
        analysis,
        currentPosition,
        sourceDrone?.vendor ?? "Unknown vendor",
        runToken,
      );
      if (!isRunActive(runToken)) return "HELD";
      if (liveApproval.outcome === "RETURNING_HOME") {
        await returnMissionHome(
          mission,
          flightRoute,
          0.5,
          runToken,
        );
        return "RETURNING_HOME";
      }
      if (liveApproval.outcome !== "APPROVED" || !liveApproval.memory) {
        return "HELD";
      }
      liveMitigation =
        liveApproval.mitigation ?? "ADJUST_ALTITUDE";
      savedMemory = liveApproval.memory;
      setMemory(savedMemory);
      setVisionAnalysis({
        ...analysis,
        memory: savedMemory,
        memorySaveStatus: "SAVED",
        memorySaveMessage: `Verified memory ${savedMemory.id} saved to Airtable.`,
      });
      pushIntegrationEvent(
        "Airtable",
        `Human-verified memory ${savedMemory.id} saved and available to fleet`,
        "Completed",
      );
    }

    if (analysis.decision.action === "REROUTE") {
      setCurrentStatus("MEMORY SAVED");
    }
    await wait(450);
    if (!isRunActive(runToken)) return;
    setCurrentStatus("REROUTING");
    const continuingCurrentRoute = liveMitigation === "ADJUST_ALTITUDE";
    const resumedRoute: RouteId = continuingCurrentRoute ? flightRoute : "C";
    setSelectedRoute(resumedRoute);
    setRouteStatuses(
      continuingCurrentRoute
        ? { A: "selected", B: "candidate", C: "candidate" }
        : {
            A: flightRoute === "A" ? "blocked" : "candidate",
            B: flightRoute === "B" ? "blocked" : "candidate",
            C: "selected",
          },
    );
    setEtaLabel("3 min");
    pushCommand(
      continuingCurrentRoute
        ? "Adjust altitude and continue Route A"
        : "Select Route C",
    );
    pushIntegrationEvent(
      "Route Updated",
      continuingCurrentRoute
        ? "Route A retained with an operator-approved vertical avoidance corridor"
        : `Route ${flightRoute} rejected; Route C rendered and selected`,
      "Completed",
    );

    await wait(500);
    if (!isRunActive(runToken)) return;
    if (continuingCurrentRoute) {
      pushCommand("Climb slightly to 155 m");
      setFlightModeOverride("REROUTING");
      pushIntegrationEvent(
        "Deterministic Safety Engine",
        "155 m vertical avoidance clears the crane altitude band ending at 148 m",
        "Completed",
      );
      await animateAltitudeAtCurrentPosition(
        155,
        900,
        setDronePosition,
        () => isRunActive(runToken),
      );
      if (!isRunActive(runToken)) return;
    }
    pushCommand("Resume flight");
    setFlightModeOverride(null);
    setCurrentStatus("IN FLIGHT");
    setLiveBattery((current) => (current === null ? null : current - 4));
    const resumedRoutes = continuingCurrentRoute
      ? routes.map((route) =>
          route.id === resumedRoute
            ? {
                ...route,
                waypoints: route.waypoints.map((point, index) =>
                  index === 3 || index === 4
                    ? { ...point, altitude: 155 }
                    : point,
                ),
              }
            : route,
        )
      : routes;
    if (continuingCurrentRoute) {
      setActiveMapScene((current) => ({
        ...current,
        routes: resumedRoutes,
      }));
    }
    await sendCustomerUpdate(mission, "APPROACHING_DESTINATION", {
      eta: estimatedRemainingEtaLabel(mission, 0.82),
    });
    if (!isRunActive(runToken)) return;
    await animateRoute(
      resumedRoutes,
      resumedRoute,
      0.5,
      1,
      adjustedAnimationDuration(mission, 2600),
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

  async function runLiveMission2(mission: Mission, runToken: number) {
    const droneModel = mission.confirmedDrone ?? "CargoSwift S2";
    const routes = mission.mapScene.routes;
    const flightRoute = mission.selectedRoute ?? "B";

    const retrievedMemory = mission.memories.find((item) => item.usedBy === droneModel) ?? mission.memories[0] ?? null;
    pushIntegrationEvent(
      retrievedMemory?.dataSource === "AIRTABLE" ? "Airtable" : "Mission Agent",
      retrievedMemory
        ? `Learned by ${retrievedMemory.learnedBy} → verified by operator → reused by ${droneModel}. Exact record ${retrievedMemory.id}`
        : "No route-blocking memory loaded",
      "Completed",
    );
    if (retrievedMemory) {
      pushIntegrationEvent(
        "Deterministic Safety Engine",
        `${retrievedMemory.id} matched Route A coordinates and altitude; Route A rejected before launch, Route ${mission.selectedRoute} selected`,
        "Completed",
      );
    }
    if (retrievedMemory) {
      const usedMemory = markMemoryUsed(retrievedMemory, droneModel);
      setMemory(usedMemory);
    }

    // Keep the Mission 2 decision visible long enough to narrate during the demo.
    await wait(5_000);
    if (!isRunActive(runToken)) return;
    await animateRoute(
      routes,
      flightRoute,
      0,
      0.8,
      adjustedAnimationDuration(mission, 3100),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return;

    await sendCustomerUpdate(mission, "APPROACHING_DESTINATION", {
      eta: estimatedRemainingEtaLabel(mission, 0.8),
    });
    if (!isRunActive(runToken)) return;
    setCurrentStatus("OBSTACLE DETECTED");
    setFlightModeOverride("HOLD");
    setEtaLabel("Holding");
    pushCommand("Hold position");
    pushIntegrationEvent("Drone Sensor", "Drop-off blocked: ground activity detected at the original delivery zone", "Completed");
    pushIntegrationEvent("Deterministic Safety Engine", "Drone holding safely at the final approach waypoint", "Completed");

    const holdingPoint = interpolateRoute(routes, flightRoute, 0.8);
    const safetyContext = {
      primaryPoint: mission.mapScene.destination,
      blockedZones: [
        { center: mission.mapScene.destination, radiusM: 25 },
      ],
      routeEligible: Boolean(
        mission.routeEval?.find((route) => route.id === flightRoute)?.status !==
          "blocked" &&
          mission.airspaceEval?.routeResults.find((route) => route.id === flightRoute)
            ?.eligible,
      ),
      weatherSafe: mission.weatherEvaluation?.severity !== "UNSAFE",
      batteryReservePercent:
        liveBattery ??
        fleet.find((drone) => drone.model === droneModel)?.batteryPercent ??
        0,
    };
    const questionCommunication = await sendCustomerUpdate(
      mission,
      "ALTERNATE_DROPOFF_REQUIRED",
      { safetyContext },
    );
    if (!isRunActive(runToken)) return "HELD";
    const questionEvent = questionCommunication?.events.find(
      (event) => event.eventType === "ALTERNATE_DROPOFF_REQUIRED",
    );

    let finalDropOffName: "Terrace" | "Front Entrance";
    let finalDropOffPoint: GeoPoint3D;
    if (questionEvent && questionEvent.status !== "failed") {
      pushIntegrationEvent("Customer", "Waiting for secure customer choice");
      const customerResult = await waitForCustomerChoice(mission.id, runToken);
      if (!customerResult || !isRunActive(runToken)) return "HELD";
      if (!customerResult.replyReceived) {
        pushCommand("Maintain safe hold");
        pushIntegrationEvent(
          "Customer",
          "No customer choice received; drone remains holding",
          "Failed",
        );
        return "HELD";
      }
      pushIntegrationEvent(
        "Customer",
        `Customer web choice received: ${customerResult.selectedAlternative}`,
        "Completed",
      );
      pushIntegrationEvent(
        "Deterministic Safety Engine",
        `${customerResult.safetyValidation}: ${customerResult.safetyReason ?? "Safety validation completed"}`,
        customerResult.safetyValidation === "SAFE" ? "Completed" : "Failed",
      );
      if (
        customerResult.safetyValidation !== "SAFE" ||
        !customerResult.updatedDropOff
      ) {
        setApproval({
          category: "Blocked drop-off zone",
          reason:
            customerResult.safetyReason ??
            "The customer-selected alternate failed deterministic checks.",
          recommendedAction:
            "Review a different safe destination. The failed safety check cannot be overridden.",
          requestId: null,
          status: "HELD",
          transport: "SLACK",
          missionId: mission.id,
          droneName: droneModel,
          proposedAlternative:
            customerResult.selectedAlternative ?? "No accepted alternative",
          routeImpact: "No destination change was applied.",
          statusMessage:
            "Slack operator review requested; the drone remains in HOLD.",
        });
        pushCommand("Maintain safe hold");
        return "HELD";
      }
      finalDropOffName = customerResult.updatedDropOff;
      finalDropOffPoint =
        finalDropOffName === "Terrace"
          ? mission.mapScene.alternateDropOffA
          : mission.mapScene.alternateDropOffB;
    } else {
      const fallbackDecision = validateAlternativeDropOff(
        {
          name: "Front Entrance",
          point: mission.mapScene.alternateDropOffB,
        },
        safetyContext,
      );
      if (fallbackDecision.result !== "SAFE") {
        pushIntegrationEvent(
          "Deterministic Safety Engine",
          `UNSAFE DEMO_FALLBACK: ${fallbackDecision.reason}`,
          "Failed",
        );
        pushCommand("Maintain safe hold");
        return "HELD";
      }

      const baseApproval: ApprovalRequest = {
        category: "Blocked drop-off zone",
        reason:
          "The alternate-location SMS could not be delivered. The drone is holding safely.",
        recommendedAction:
          "Review the deterministic-safe Front Entrance DEMO_FALLBACK.",
        requestId: null,
        status: "SENDING",
        transport: "SLACK",
        missionId: mission.id,
        droneName: droneModel,
        proposedAlternative: "Front Entrance (DEMO_FALLBACK)",
        routeImpact: `Divert Route ${flightRoute} final approach; ETA +2 min.`,
        statusMessage: "Creating a Slack operator review.",
        risks: [
          {
            id: "customer-message-undelivered",
            kind: "DELIVERY_ZONE",
            level: "CAUTION",
            riskDetected:
              "Customer alternate-location question was not delivered.",
            currentValue: "No verified customer web choice",
            allowedLimit:
              "Operator review required before using a fallback destination",
            agentRecommendation:
              "Approve only the deterministic-safe Front Entrance fallback.",
            proposedAdjustment:
              "Divert to Front Entrance and record DEMO_FALLBACK.",
          },
        ],
      };
      setApproval(baseApproval);
      setSlackConnectionState("loading");
      pushIntegrationEvent(
        "Slack",
        "Requesting operator review because customer SMS was not delivered",
      );
      const initialApproval = await requestSlackApproval({
        idempotencyKey: `${mission.id}:twilio-failure:blocked-primary-dropoff`,
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
        proposedAlternative: baseApproval.proposedAlternative ?? "Front Entrance",
        routeImpact: baseApproval.routeImpact ?? `Route ${flightRoute} final approach diversion`,
        etaImpact: "Estimated arrival increases by 2 minutes.",
      });
      if (!isRunActive(runToken)) return "HELD";
      setApproval(toUiApproval(baseApproval, initialApproval));
      setSlackConnectionState(
        initialApproval.transport === "SLACK" ? "success" : "error",
      );
      const finalApproval = await waitForMissionApproval(
        initialApproval,
        baseApproval,
        runToken,
      );
      if (!isRunActive(runToken)) return "HELD";
      setApproval(toUiApproval(baseApproval, finalApproval));
      if (finalApproval.status === "REJECTED") {
        setCurrentStatus("ABORTED");
        setEtaLabel("Aborted");
        pushCommand("Abort mission");
        return "REJECTED";
      }
      if (finalApproval.status !== "APPROVED") {
        setFlightModeOverride("HOLD");
        pushCommand("Maintain safe hold");
        return "HELD";
      }
      pushIntegrationEvent(
        "Operator",
        "Front Entrance DEMO_FALLBACK approved after Twilio delivery failure",
        "Completed",
      );
      finalDropOffName = "Front Entrance";
      finalDropOffPoint = mission.mapScene.alternateDropOffB;
      const fallbackCommunication =
        await recordOperatorApprovedCustomerFallback(
          mission.id,
          finalDropOffName,
        );
      if (fallbackCommunication) {
        customerCommunicationRef.current = fallbackCommunication;
        setCustomerCommunication(fallbackCommunication);
        updateMission(mission.id, (current) => ({
          ...current,
          customerCommunication: fallbackCommunication,
        }));
      }
    }

    setApproval(null);
    const alternateRoutes = routes.map((route) =>
      route.id === flightRoute
        ? {
            ...route,
            waypoints: [...route.waypoints.slice(0, -1), finalDropOffPoint],
          }
        : route,
    );
    const updatedDropOffZone = {
      id: finalDropOffName === "Terrace" ? "DZ-ALT-A" : "DZ-ALT-B",
      label: finalDropOffName,
      point: finalDropOffPoint,
    };
    setActiveMapScene((current) => ({
      ...current,
      routes: alternateRoutes,
      destination: finalDropOffPoint,
      destinationLabel: finalDropOffName,
      dropOffZone: updatedDropOffZone,
    }));
    updateMission(mission.id, (current) => ({
      ...current,
      mapScene: {
        ...current.mapScene,
        routes: alternateRoutes,
        destination: finalDropOffPoint,
        destinationLabel: finalDropOffName,
        dropOffZone: updatedDropOffZone,
      },
    }));
    pushCommand(`Destination updated to ${finalDropOffName}`);
    pushIntegrationEvent(
      "Route Updated",
      `Destination updated to ${finalDropOffName}; map label and Route ${flightRoute} final waypoint changed`,
      "Completed",
    );
    setFlightModeOverride(null);
    setCurrentStatus("IN FLIGHT");
    setLiveBattery((current) => (current === null ? null : current - 5));
    await animateRoute(
      alternateRoutes,
      flightRoute,
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

  async function requestLiveObstacleApproval(
    mission: Mission,
    analysis: GeminiObstacleApiResponse,
    position: GeoPoint3D,
    vendorName: string,
    runToken: number,
  ): Promise<{
    outcome: "APPROVED" | "HELD" | "RETURNING_HOME";
    memory: OperationalMemory | null;
    mitigation: "ADJUST_ALTITUDE" | "CHOOSE_ALTERNATE_ROUTE" | null;
  }> {
    const observation = analysis.observation;
    const memoryDraft = analysis.memory;
    if (!observation || !memoryDraft) {
      return { outcome: "HELD", memory: null, mitigation: null };
    }

    const risk: MissionRiskCondition = {
      id: `live-crane-${mission.id}`,
      kind: "ROUTE_ADJUSTMENT",
      level: "CAUTION",
      riskDetected: "Construction crane intersects Route A in location and altitude.",
      currentValue: `Route A at ${Math.round(position.altitude)} m; crane band ${observation.minimumAltitudeM}-${observation.maximumAltitudeM} m`,
      allowedLimit: "No route entry inside the 120 m avoidance radius with altitude overlap",
      agentRecommendation: "Approve a slight climb to 155 m and continue Route A, or choose alternate Route C.",
      proposedAdjustment: "Climb to 155 m to clear the crane band ending at 148 m.",
    };
    const baseApproval: ApprovalRequest = {
      category: "Live obstacle reroute",
      approvalKind: "LIVE_OBSTACLE_REROUTE",
      reason: analysis.decision.reason,
      recommendedAction: "Adjust altitude to 155 m and continue Route A, or choose Route C.",
      requestId: null,
      status: "SENDING",
      transport: "SLACK",
      missionId: mission.id,
      droneName: mission.confirmedDrone ?? "Atlas HeavyLift",
      proposedAlternative: "Adjust altitude to 155 m · Route C remains an alternate.",
      routeImpact: "Route A is blocked at the current altitude; vertical or lateral avoidance requires operator approval.",
      statusMessage: "Awaiting operator decision.",
      risks: [risk],
    };
    setApproval(baseApproval);
    setSlackConnectionState("loading");
    pushIntegrationEvent(
      "Slack",
      "Sending altitude-adjustment and alternate-route choices with obstacle evidence",
    );

    const initial = await requestSlackApproval({
      idempotencyKey: `${mission.id}:live-crane:${memoryDraft.id}`,
      missionId: mission.id,
      droneName: mission.confirmedDrone ?? "Atlas HeavyLift",
      vendorName,
      approvalKind: "LIVE_OBSTACLE_REROUTE",
      currentStatus: "HOLD",
      coordinates: {
        lat: position.lat,
        lng: position.lng,
        altitudeM: position.altitude,
      },
      reason: analysis.decision.reason,
      risks: [risk],
      proposedAlternative: "Adjust altitude to 155 m or choose Route C",
      routeImpact: "Route A is blocked only within the crane altitude band; operator mitigation is pending.",
      etaImpact: "Estimated ETA +1 minute.",
      liveObstacle: {
        detectedObstacle: observation.obstacleType.replaceAll("_", " "),
        geminiConfidence: observation.confidence,
        currentRoute: mission.selectedRoute ?? "A",
        recommendedRoute: "C",
        recommendedAltitudeM: 155,
        rejectionReason: analysis.decision.reason,
      },
      memoryDraft,
    });
    if (!isRunActive(runToken)) {
      return { outcome: "HELD", memory: null, mitigation: null };
    }
    setApproval(toUiApproval(baseApproval, initial));
    setSlackConnectionState(
      initial.transport === "SLACK" ? "success" : "error",
    );
    pushIntegrationEvent(
      "Slack",
      initial.transport === "SLACK"
        ? "Altitude adjustment / Route C choice sent; awaiting operator"
        : initial.statusMessage,
      initial.transport === "SLACK" ? "Completed" : "Failed",
    );

    const final = await waitForApprovalResolution(initial, baseApproval, () =>
      isRunActive(runToken),
    );
    if (!isRunActive(runToken)) {
      return { outcome: "HELD", memory: null, mitigation: null };
    }
    setApproval(toUiApproval(baseApproval, final));
    if (final.status === "APPROVED" && final.memory) {
      setApproval(null);
      setFlightModeOverride(null);
      pushIntegrationEvent(
        "Operator",
        final.mitigation === "CHOOSE_ALTERNATE_ROUTE"
          ? "Alternate Route C approved; human verification recorded"
          : "155 m altitude adjustment approved; Route A will continue",
        "Completed",
      );
      return {
        outcome: "APPROVED",
        memory: final.memory,
        mitigation: final.mitigation ?? "ADJUST_ALTITUDE",
      };
    }
    if (final.status === "REJECTED") {
      setApproval(null);
      pushIntegrationEvent(
        "Operator",
        "Return Home selected; no active memory created",
        "Completed",
      );
      return { outcome: "RETURNING_HOME", memory: null, mitigation: null };
    }

    if (final.status === "APPROVED" && !final.memory) {
      setApproval({
        ...toUiApproval(baseApproval, final),
        status: "HELD",
        statusMessage:
          "No signed Slack-backed Airtable memory was created. The drone remains holding and no mitigation was activated.",
      });
    }
    setFlightModeOverride("HOLD");
    pushCommand("Maintain safe hold");
    pushIntegrationEvent(
      "Operator",
      "Awaiting operator decision. No active memory created.",
      "Completed",
    );
    return { outcome: "HELD", memory: null, mitigation: null };
  }

  async function returnMissionHome(
    mission: Mission,
    routeId: RouteId,
    fromProgress: number,
    runToken: number,
  ) {
    setCurrentStatus("RETURNING_HOME");
    setFlightModeOverride("RETURNING");
    setEtaLabel("Returning");
    pushCommand("Return Home");
    pushIntegrationEvent(
      "Mission Agent",
      "Safe return path activated; package remains undelivered",
      "Completed",
    );
    await animateRoute(
      mission.mapScene.routes,
      routeId,
      fromProgress,
      0,
      adjustedAnimationDuration(mission, 2200),
      setDronePosition,
      setRouteProgress,
      (progress) => updateLiveTelemetry(mission, progress),
      () => isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return;
    setEtaLabel("Returned home");
    setFleet((current) =>
      current.map((drone) =>
        drone.model === mission.confirmedDrone
          ? { ...drone, status: "Available" }
          : drone,
      ),
    );
    settleIntegrationFlow();
  }

  async function requestVisionHumanReview(
    mission: Mission,
    analysis: GeminiObstacleApiResponse,
    position: GeoPoint3D,
    runToken: number,
  ): Promise<"APPROVED" | "HELD" | "REJECTED"> {
    const observation = analysis.observation;
    if (!observation) return "HELD";

    const risk: MissionRiskCondition = {
      id: `vision-confidence-${mission.id}`,
      kind: "OBSTACLE_CONFIDENCE",
      level: "CAUTION",
      riskDetected:
        observation.confidence < 0.5
          ? "Gemini obstacle observation is unverified."
          : "Gemini obstacle observation is below the autonomous-reroute threshold.",
      currentValue: `${Math.round(observation.confidence * 100)}% confidence`,
      allowedLimit: "≥ 80% for autonomous rerouting",
      agentRecommendation:
        "Keep the drone holding and request operator review.",
      proposedAdjustment:
        "Confirm a conservative reroute to Route C or keep the mission on hold.",
    };
    const baseApproval: ApprovalRequest = {
      category: "Low-confidence obstacle",
      reason: analysis.decision.reason,
      recommendedAction: risk.agentRecommendation,
      requestId: null,
      status: "SENDING",
      transport: "SLACK",
      missionId: mission.id,
      droneName: mission.confirmedDrone ?? "Unassigned",
      proposedAlternative: risk.proposedAdjustment,
      routeImpact: `Route ${mission.selectedRoute ?? "A"} remains paused; Route C is the conservative alternate.`,
      statusMessage: "Creating Slack review for Gemini perception.",
      risks: [risk],
    };
    setApproval(baseApproval);
    setSlackConnectionState("loading");
    pushIntegrationEvent("Slack", "Sending human-review request");

    const initial = await requestSlackApproval({
      idempotencyKey: `${mission.id}:gemini-obstacle:${Math.round(observation.confidence * 100)}`,
      missionId: mission.id,
      droneName: mission.confirmedDrone ?? "Unassigned",
      currentStatus: "HOLDING safely",
      coordinates: {
        lat: position.lat,
        lng: position.lng,
        altitudeM: position.altitude,
      },
      reason: analysis.decision.reason,
      risks: [risk],
      proposedAlternative: risk.proposedAdjustment,
      routeImpact: baseApproval.routeImpact ?? "Conservative Route C reroute",
      etaImpact: "Estimated ETA +1 minute if Route C is approved.",
    });
    if (!isRunActive(runToken)) return "HELD";
    setApproval(toUiApproval(baseApproval, initial));
    setSlackConnectionState(
      initial.transport === "SLACK" ? "success" : "error",
    );
    pushIntegrationEvent(
      "Slack",
      initial.transport === "SLACK"
        ? "Human-review request sent"
        : initial.statusMessage,
      initial.transport === "SLACK" ? "Completed" : "Failed",
    );

    const final = await waitForApprovalResolution(initial, baseApproval, () =>
      isRunActive(runToken),
    );
    if (!isRunActive(runToken)) return "HELD";
    setApproval(toUiApproval(baseApproval, final));

    if (final.status === "APPROVED") {
      setApproval(null);
      setFlightModeOverride(null);
      pushIntegrationEvent(
        "Operator",
        "Conservative Route C reroute approved; no low-confidence memory saved",
        "Completed",
      );
      return "APPROVED";
    }
    if (final.status === "REJECTED") {
      setCurrentStatus("ABORTED");
      setFlightModeOverride("HOLD");
      setEtaLabel("Aborted");
      pushIntegrationEvent(
        "Operator",
        "Mission rejected after Gemini obstacle review",
        "Failed",
      );
      return "REJECTED";
    }

    setFlightModeOverride("HOLD");
    pushIntegrationEvent(
      "Operator",
      final.statusMessage,
      final.status === "TIMED_OUT" ? "Failed" : "Completed",
    );
    return "HELD";
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

  async function waitForCustomerChoice(
    missionId: string,
    runToken: number,
  ): Promise<CustomerCommunicationSnapshot | null> {
    const deadline = Date.now() + 5 * 60 * 1_000;
    let latest: CustomerCommunicationSnapshot | null = null;
    while (isRunActive(runToken) && Date.now() < deadline) {
      try {
        const response = await fetch(
          `/api/twilio/mission?missionId=${encodeURIComponent(missionId)}`,
          { cache: "no-store" },
        );
        const data: unknown = await response.json();
        if (response.ok && isCustomerCommunicationSnapshot(data)) {
          latest = data;
          customerCommunicationRef.current = data;
          setCustomerCommunication(data);
          updateMission(missionId, (current) => ({
            ...current,
            customerCommunication: data,
          }));
          if (data.replyReceived || data.operatorReviewRequested) return data;
        }
      } catch {
        // The safe HOLD continues while a transient polling failure recovers.
      }
      await wait(1_500);
    }
    return latest;
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
    setVisionAnalysis(null);
    setVisionPhase("IDLE");
    setCustomerCommunication(null);
    customerCommunicationRef.current = null;
    setTwilioToasts([]);
    shownTwilioToastKeysRef.current.clear();
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
    pushIntegrationEvent("Deterministic Safety Engine", "Low-confidence obstacle triggered CAUTION hold", "Completed");

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
            customerCommunication={customerCommunication}
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
            visionAnalysis={visionAnalysis}
            visionPhase={visionPhase}
          />
          ) : null}
        </div>
      </div>

      <TwilioToastViewport
        toast={twilioToasts[0] ?? null}
        onDismiss={dismissTwilioToast}
      />
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
  ) && mission.pattern !== "MISSION_1";
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
  vendorName?: string;
  approvalKind?: SlackApprovalKind;
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
  liveObstacle?: {
    detectedObstacle: string;
    geminiConfidence: number;
    currentRoute: RouteId;
    recommendedRoute: RouteId;
    recommendedAltitudeM: number;
    rejectionReason: string;
  };
  memoryDraft?: OperationalMemory;
}

async function registerCustomerCommunication(
  mission: Mission,
  recipientPhone?: string,
): Promise<CustomerCommunicationSnapshot> {
  try {
    const response = await fetch("/api/twilio/mission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missionId: mission.id,
        useDemoRecipient: mission.input.useDemoRecipient,
        recipientPhone,
        primaryDropOffName: primaryDropOffName(mission.input),
        alternatives: [
          { name: "Terrace", point: mission.mapScene.alternateDropOffA },
          {
            name: "Front Entrance",
            point: mission.mapScene.alternateDropOffB,
          },
        ],
      }),
      cache: "no-store",
    });
    const data: unknown = await response.json();
    if (
      response.ok &&
      data &&
      typeof data === "object" &&
      isCustomerCommunicationSnapshot(
        (data as { communication?: unknown }).communication,
      )
    ) {
      return (data as { communication: CustomerCommunicationSnapshot })
        .communication;
    }
  } catch {
    // Registration failure is communication-only and cannot fail preflight.
  }
  return {
    missionId: mission.id,
    recipientMasked: mission.input.useDemoRecipient
      ? "Unavailable"
      : maskPhoneForUi(recipientPhone),
    transport: "DEMO_FALLBACK",
    events: [],
    waitingForReply: false,
    replyReceived: false,
    selectedAlternative: null,
    safetyValidation: null,
    safetyReason: null,
    updatedDropOff: null,
    operatorReviewRequested: false,
    updatedAt: new Date().toISOString(),
  };
}

async function recordOperatorApprovedCustomerFallback(
  missionId: string,
  finalDropOffName: "Terrace" | "Front Entrance",
): Promise<CustomerCommunicationSnapshot | null> {
  try {
    const response = await fetch("/api/twilio/mission", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missionId,
        finalDropOffName,
        source: "OPERATOR_DEMO_FALLBACK",
      }),
      cache: "no-store",
    });
    const data: unknown = await response.json();
    return response.ok && isCustomerCommunicationSnapshot(data) ? data : null;
  } catch {
    return null;
  }
}

function isCustomerMessageApiResponse(
  value: unknown,
): value is {
  communication: CustomerCommunicationSnapshot;
  duplicate: boolean;
  displayMessage: string;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    communication?: unknown;
    duplicate?: unknown;
    displayMessage?: unknown;
  };
  return (
    isCustomerCommunicationSnapshot(candidate.communication) &&
    typeof candidate.duplicate === "boolean" &&
    typeof candidate.displayMessage === "string"
  );
}

function isCustomerCommunicationSnapshot(
  value: unknown,
): value is CustomerCommunicationSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CustomerCommunicationSnapshot>;
  return Boolean(
    typeof candidate.missionId === "string" &&
      typeof candidate.recipientMasked === "string" &&
      (candidate.transport === "TWILIO" ||
        candidate.transport === "DEMO_FALLBACK") &&
      Array.isArray(candidate.events) &&
      candidate.events.every(
        (event) =>
          event &&
          typeof event === "object" &&
          typeof event.eventType === "string" &&
          ["queued", "sent", "delivered", "failed"].includes(event.status),
      ) &&
      typeof candidate.waitingForReply === "boolean" &&
      typeof candidate.replyReceived === "boolean" &&
      typeof candidate.operatorReviewRequested === "boolean" &&
      typeof candidate.updatedAt === "string",
  );
}

function maskPhoneForUi(phone?: string) {
  const suffix = phone?.replace(/\D/g, "").slice(-4);
  return suffix ? `••• ••• ${suffix}` : "Unavailable";
}

async function requestGeminiObstacleAnalysis(params: {
  mission: Mission;
  droneModel: string;
  sourceVendor: string;
  routeId: RouteId;
  position: GeoPoint3D;
}): Promise<GeminiObstacleApiResponse> {
  const route = params.mission.mapScene.routes.find(
    (candidate) => candidate.id === params.routeId,
  );
  if (!route) {
    return geminiClientFailure(
      "GEMINI_API_FAILURE: current route geometry is unavailable.",
    );
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/gemini/obstacle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode:
          params.mission.memoryMode === "DEMO_FALLBACK"
            ? "DEMO_FALLBACK"
            : "LIVE",
        missionId: params.mission.id,
        droneId: params.droneModel,
        sourceVendor: params.sourceVendor,
        currentRoute: params.routeId,
        droneCoordinates: {
          latitude: params.position.lat,
          longitude: params.position.lng,
        },
        altitudeM: params.position.altitude,
        routeWaypoints: route.waypoints,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    return isGeminiObstacleApiResponse(data)
      ? data
      : geminiClientFailure(
          `GEMINI_API_FAILURE: obstacle endpoint returned invalid data (HTTP ${response.status}).`,
        );
  } catch (error) {
    return geminiClientFailure(
      error instanceof Error && error.name === "AbortError"
        ? "GEMINI_API_FAILURE: obstacle analysis timed out."
        : "GEMINI_API_FAILURE: obstacle endpoint could not be reached.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

function geminiClientFailure(message: string): GeminiObstacleApiResponse {
  return {
    status: "GEMINI_API_FAILURE",
    source: null,
    model: "unavailable",
    message,
    latencyMs: 0,
    schemaValidation: false,
    observation: null,
    decision: {
      action: "GEMINI_API_FAILURE",
      reason:
        "Gemini perception is unavailable; deterministic rules require a safe hold.",
      affectedRoute: null,
      routeOverlap: false,
      altitudeOverlap: false,
      relevantForMemory: false,
    },
    memory: null,
    memorySaveStatus: "NOT_APPLICABLE",
    memorySaveMessage:
      "No memory saved because Gemini perception did not validate.",
  };
}

function isGeminiObstacleApiResponse(
  value: unknown,
): value is GeminiObstacleApiResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GeminiObstacleApiResponse>;
  const decision = candidate.decision;
  const observation = candidate.observation;
  return Boolean(
    candidate.status &&
      ["SUCCESS", "GEMINI_API_FAILURE", "INVALID_REQUEST"].includes(
        candidate.status,
      ) &&
      (candidate.source === "GEMINI" ||
        candidate.source === "DEMO_FALLBACK" ||
        candidate.source === null) &&
      typeof candidate.model === "string" &&
      typeof candidate.message === "string" &&
      Number.isFinite(candidate.latencyMs) &&
      typeof candidate.schemaValidation === "boolean" &&
      decision &&
      [
        "CONTINUE",
        "REROUTE",
        "HOLD_FOR_HUMAN_REVIEW",
        "GEMINI_API_FAILURE",
      ].includes(decision.action) &&
      typeof decision.reason === "string" &&
      typeof decision.routeOverlap === "boolean" &&
      typeof decision.altitudeOverlap === "boolean" &&
      typeof decision.relevantForMemory === "boolean" &&
      (observation === null ||
        (typeof observation?.obstacleDetected === "boolean" &&
          observation.obstacleType === "CONSTRUCTION_CRANE" &&
          typeof observation.description === "string" &&
          Number.isFinite(observation.confidence) &&
          Number.isFinite(observation.estimatedCoordinates?.latitude) &&
          Number.isFinite(observation.estimatedCoordinates?.longitude) &&
          Number.isFinite(observation.minimumAltitudeM) &&
          Number.isFinite(observation.maximumAltitudeM) &&
          Number.isFinite(observation.recommendedMemoryTtlMinutes))) &&
      (candidate.memory === null ||
        (candidate.memory !== undefined &&
          isOperationalMemory(candidate.memory))) &&
      candidate.memorySaveStatus &&
      [
        "NOT_APPLICABLE",
        "AWAITING_APPROVAL",
        "SAVED",
        "DUPLICATE",
        "FAILED",
        "DEMO_FALLBACK_PENDING",
      ].includes(candidate.memorySaveStatus) &&
      typeof candidate.memorySaveMessage === "string",
  );
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
      typeof candidate.duplicate === "boolean" &&
      (candidate.memory === undefined || isOperationalMemory(candidate.memory)),
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
  return requestMemoryApi();
}

async function requestMemoryApi(): Promise<MemoryApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);

  try {
    const response = await fetch("/api/memory", {
      method: "GET",
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
      (memory.verificationStatus === "Awaiting Verification" ||
        memory.verificationStatus === "Human Verified") &&
      (memory.verificationStatus !== "Human Verified" ||
        (typeof memory.verifiedAt === "string" &&
          typeof memory.verifiedBy === "string")) &&
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
              airtableState === "SUCCESS" || airtableState === "SUCCESS_EMPTY"
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
