import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteAnimationEngine } from "@/lib/map/route-animation";
import type { RouteId } from "@/types/domain";
import type { Waypoint3D } from "@/types/map";

const routes: Record<RouteId, Waypoint3D[]> = {
  A: [
    { lat: 37, lng: -122, altitudeM: 100 },
    { lat: 37.001, lng: -122, altitudeM: 120 },
  ],
  B: [
    { lat: 37, lng: -122, altitudeM: 100 },
    { lat: 37, lng: -121.999, altitudeM: 110 },
  ],
  C: [
    { lat: 36.999, lng: -122.001, altitudeM: 105 },
    { lat: 37.0006, lng: -121.9998, altitudeM: 105 },
    { lat: 37.0015, lng: -121.9985, altitudeM: 90 },
  ],
};

describe("RouteAnimationEngine", () => {
  let callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let cancelled: number[] = [];

  beforeEach(() => {
    callbacks = new Map();
    cancelled = [];
    nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelled.push(id);
      callbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function frame(timestamp: number) {
    const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!entry) throw new Error("No animation frame scheduled.");
    callbacks.delete(entry[0]);
    entry[1](timestamp);
  }

  it("pauses and resumes from the exact position without duplicate loops", () => {
    const engine = new RouteAnimationEngine(routes);
    engine.startRoute("A");
    frame(0);
    frame(120);
    const held = engine.getPosition();

    engine.pauseFlight();
    frame(2_000);
    expect(engine.getPosition()).toEqual(held);
    expect(callbacks.size).toBe(0);

    engine.resumeFlight();
    engine.resumeFlight();
    expect(callbacks.size).toBe(1);
    frame(10_000);
    expect(engine.getPosition()).toEqual(held);
    frame(10_120);
    expect(engine.getPosition()).not.toEqual(held);
  });

  it("starts a reroute at the current position", () => {
    const engine = new RouteAnimationEngine(routes);
    engine.startRoute("A");
    frame(0);
    frame(120);
    const before = engine.getPosition();

    engine.transitionToRoute("C");

    expect(engine.getRouteId()).toBe("C");
    expect(engine.getPosition()).toEqual(before);
  });

  it("keeps an altitude adjustment synchronized with route movement", () => {
    const engine = new RouteAnimationEngine(routes);
    engine.startRoute("A");
    frame(0);
    engine.changeAltitude(105 * 3.28084);

    for (let index = 1; index <= 48; index += 1) {
      frame(index * 120);
    }

    expect(engine.getPosition().altitudeM).toBeCloseTo(105, 0);
    const latitude = engine.getPosition().lat;
    frame(49 * 120);
    expect(engine.getPosition().altitudeM).toBeCloseTo(105, 0);
    expect(engine.getPosition().lat).toBeGreaterThanOrEqual(latitude);
  });

  it("cancels its pending animation frame during cleanup", () => {
    const engine = new RouteAnimationEngine(routes);
    engine.startRoute("A");
    const scheduled = [...callbacks.keys()][0];

    engine.cancel();

    expect(cancelled).toContain(scheduled);
    expect(callbacks.size).toBe(0);
    expect(engine.isRunning()).toBe(false);
  });
});
