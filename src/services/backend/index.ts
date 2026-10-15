import { isTauri } from "@tauri-apps/api/core";

import { createTauriBackend } from "./tauri";
import type { Backend } from "./types";

export type { Backend, BackendEvents, Unlisten } from "./types";

let instance: Backend | null = null;

/**
 * Resolve the backend once at startup. Inside the Tauri window this is always the
 * real IPC backend. The browser preview is only reachable from `vite dev` in a
 * plain browser and is tree-shaken out of production bundles.
 */
export async function initBackend(): Promise<Backend> {
  if (instance) return instance;
  if (isTauri()) {
    instance = createTauriBackend();
  } else if (import.meta.env.DEV) {
    const { createPreviewBackend } = await import("./preview");
    instance = createPreviewBackend();
  } else {
    throw new Error("RYLORA must be run inside its desktop shell.");
  }
  return instance;
}

export function backend(): Backend {
  if (!instance) throw new Error("Backend used before initBackend()");
  return instance;
}
