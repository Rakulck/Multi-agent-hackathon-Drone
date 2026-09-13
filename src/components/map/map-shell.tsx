import { GoogleMaps3DView } from "@/components/map/google-maps-3d-view";
import type { DropOffZone, GeoPoint3D, MissionMapScene, RouteId, RouteLegendItem, RouteStatus } from "@/types/domain";
import type { DroneMapHandle, MapMissionAnimationContext } from "@/types/map";
import { forwardRef } from "react";

export interface MapShellProps extends MapMissionAnimationContext {
  routes: RouteLegendItem[];
  routeStatuses: Record<RouteId, RouteStatus>;
  selectedRoute: RouteId | null;
  dronePosition: GeoPoint3D;
  hazardVisible: boolean;
  statusLabel: string;
  dropOffZone: DropOffZone;
  reroutingBanner?: string | null;
  selectedDrone?: string;
  scene: MissionMapScene;
  airspaceVisible?: boolean;
}

/**
 * Thin frame around the reusable 3D engine (`GoogleMaps3DView`). All map
 * chrome (legend, camera control, status overlay, dev tools) lives inside
 * the engine component itself so it stays self-contained and reusable.
 */
export const MapShell = forwardRef<DroneMapHandle, MapShellProps>(function MapShell(props, ref) {
  return (
    <section className="relative h-full min-h-0 overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
      <GoogleMaps3DView ref={ref} {...props} />
    </section>
  );
});
