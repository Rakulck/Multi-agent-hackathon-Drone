import type { CameraPresetDefinition, CameraPresetId, Waypoint3D } from "@/types/map";

/** Minimal shape of a `Map3DElement` this controller depends on. */
export interface Map3DLike {
  center?: unknown;
  flyCameraTo?: (options: { endCamera: Record<string, unknown>; durationMillis: number }) => void;
  heading?: number;
  range?: number;
  tilt?: number;
}

export interface CameraController {
  focusOnDestination: () => void;
  focusOnDrone: (position: Waypoint3D, headingDeg: number) => void;
  focusOnObstacle: () => void;
  isFollowEnabled: () => boolean;
  resetCamera: () => void;
  setFollowEnabled: (enabled: boolean) => void;
  showMissionOverview: () => void;
}

/**
 * Wraps a `Map3DElement` with a small set of reusable, named camera moves.
 * Every call goes through `flyCameraTo` for a deliberate transition — nothing
 * here fights the camera every animation frame. Follow-mode updates are
 * throttled internally so tracking the drone never looks jittery.
 */
export function createCameraController(
  getMap: () => Map3DLike | null,
  presets: Record<CameraPresetId, CameraPresetDefinition>,
  followIntervalMs = 450,
  reducedMotion = false,
): CameraController {
  let followEnabled = false;
  let lastFollowUpdateAt = 0;

  function flyTo(center: Waypoint3D, heading: number, tilt: number, range: number, durationMillis: number) {
    const map = getMap();

    if (!map) {
      return;
    }

    const endCamera = {
      center: { lat: center.lat, lng: center.lng, altitude: center.altitudeM },
      heading,
      range,
      tilt,
    };

    if (typeof map.flyCameraTo === "function" && !reducedMotion) {
      map.flyCameraTo({ durationMillis, endCamera });
    } else {
      Object.assign(map, endCamera);
    }
  }

  function flyToPreset(preset: CameraPresetDefinition, durationMillis: number) {
    flyTo(preset.center, preset.heading, preset.tilt, preset.range, durationMillis);
  }

  return {
    focusOnDestination() {
      flyToPreset(presets.DESTINATION, 900);
    },
    focusOnDrone(position, headingDeg) {
      const now = performance.now();
      if (now - lastFollowUpdateAt < followIntervalMs) {
        return;
      }
      lastFollowUpdateAt = now;
      flyTo(position, headingDeg, presets.FOLLOW_DRONE.tilt, presets.FOLLOW_DRONE.range, followIntervalMs);
    },
    focusOnObstacle() {
      flyToPreset(presets.OBSTACLE, 900);
    },
    isFollowEnabled() {
      return followEnabled;
    },
    resetCamera() {
      flyToPreset(presets.OVERVIEW, 800);
    },
    setFollowEnabled(enabled) {
      followEnabled = enabled;
    },
    showMissionOverview() {
      flyToPreset(presets.OVERVIEW, 1200);
    },
  };
}
