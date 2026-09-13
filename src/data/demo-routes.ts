import type { DemoRoute, DropOffZone, GeoPoint3D, HazardZone, RouteId, RouteLegendItem, RouteStatus } from "@/types/domain";

export const dispatchOrigin: GeoPoint3D = {
  lat: 37.78921,
  lng: -122.40155,
  altitude: 92,
};

export const apartmentDestination: GeoPoint3D = {
  lat: 37.79506,
  lng: -122.39372,
  altitude: 118,
};

export const routeA: GeoPoint3D[] = [
  dispatchOrigin,
  { lat: 37.79036, lng: -122.4001, altitude: 128 },
  { lat: 37.79178, lng: -122.39824, altitude: 138 },
  { lat: 37.7932, lng: -122.39632, altitude: 136 },
  { lat: 37.79432, lng: -122.39475, altitude: 126 },
  apartmentDestination,
];

export const routeB: GeoPoint3D[] = [
  dispatchOrigin,
  { lat: 37.78992, lng: -122.39912, altitude: 122 },
  { lat: 37.79068, lng: -122.39658, altitude: 132 },
  { lat: 37.79242, lng: -122.3949, altitude: 124 },
  { lat: 37.79388, lng: -122.39396, altitude: 120 },
  apartmentDestination,
];

export const routeC: GeoPoint3D[] = [
  dispatchOrigin,
  { lat: 37.78852, lng: -122.39962, altitude: 132 },
  { lat: 37.78896, lng: -122.39702, altitude: 148 },
  { lat: 37.79106, lng: -122.39468, altitude: 145 },
  { lat: 37.79342, lng: -122.39292, altitude: 134 },
  apartmentDestination,
];

export const demoRoutes: DemoRoute[] = [
  { id: "A", name: "Route A", label: "Primary corridor", waypoints: routeA },
  { id: "B", name: "Route B", label: "Courtyard approach", waypoints: routeB },
  { id: "C", name: "Route C", label: "Memory-safe alternate", waypoints: routeC },
];

export const craneHazard: HazardZone = {
  id: "HZ-CRANE-001",
  label: "Simulated crane sensor event",
  center: { lat: 37.79272, lng: -122.3967, altitude: 126 },
  polygon: [
    { lat: 37.79225, lng: -122.3972, altitude: 90 },
    { lat: 37.79308, lng: -122.39702, altitude: 90 },
    { lat: 37.7932, lng: -122.39618, altitude: 90 },
    { lat: 37.79236, lng: -122.39605, altitude: 90 },
  ],
};

export const alternateDropOffZone: DropOffZone = {
  id: "DZ-COURTYARD-ALT",
  label: "Alternate courtyard drop-off",
  point: { lat: 37.79378, lng: -122.39338, altitude: 96 },
};

export const initialRouteStatuses: Record<RouteId, RouteStatus> = {
  A: "candidate",
  B: "candidate",
  C: "candidate",
};

export function makeRouteLegend(statuses: Record<RouteId, RouteStatus>, routes: DemoRoute[] = demoRoutes): RouteLegendItem[] {
  return routes.map((route) => ({
    id: route.id,
    name: route.name,
    label: route.label,
    status: statuses[route.id],
  }));
}
