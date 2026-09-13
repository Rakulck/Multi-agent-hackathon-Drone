/**
 * Single shared Google Maps JS + maps3d loader.
 *
 * This module deliberately caches its promises at module scope so that:
 *  - The `<script>` tag is only ever appended once per page, no matter how
 *    many components mount/unmount or how often React re-renders.
 *  - `importLibrary("maps3d")` is only ever awaited once; every caller gets
 *    the same resolved library object.
 *
 * Never logs or exposes the API key.
 */
declare global {
  interface Window {
    google?: {
      maps?: {
        importLibrary?: (library: string) => Promise<Record<string, unknown>>;
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;
const libraryPromises = new Map<string, Promise<Record<string, unknown>>>();

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-drone-google-maps]");

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=alpha&libraries=maps3d&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.droneGoogleMaps = "true";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")), { once: true });
    document.head.append(script);
  });

  return scriptLoadPromise;
}

/**
 * Waits until `google.maps.importLibrary` is actually attached. The script's
 * `load` event can fire a tick before the library's own async bootstrap has
 * finished wiring up `importLibrary`, so a short poll (not just the `load`
 * event) avoids a rare race where the very first import call fails.
 */
function waitForImporter(timeoutMs = 5000): Promise<(library: string) => Promise<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const importer = window.google?.maps?.importLibrary;
      if (importer) {
        resolve(importer);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Google Maps importLibrary is unavailable."));
        return;
      }
      window.setTimeout(check, 50);
    }

    check();
  });
}

/** Imports (and memoizes) a Google Maps JS library, e.g. "maps3d". */
export async function importGoogleMapsLibrary(apiKey: string, library: string): Promise<Record<string, unknown>> {
  await loadGoogleMapsScript(apiKey);

  let pending = libraryPromises.get(library);

  if (!pending) {
    pending = waitForImporter().then((importer) => importer(library));
    libraryPromises.set(library, pending);
  }

  return pending;
}

/** Test-only helper: clears cached promises so a fresh load can be retried. */
export function resetGoogleMapsLoaderForRetry(): void {
  scriptLoadPromise = null;
  libraryPromises.clear();
}
