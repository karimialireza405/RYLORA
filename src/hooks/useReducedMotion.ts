import { useSyncExternalStore } from "react";

import { useUi } from "@/stores/ui";

const query = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

function subscribe(cb: () => void) {
  query?.addEventListener("change", cb);
  return () => query?.removeEventListener("change", cb);
}

/** True when motion should be minimised: the in-app setting wins over the OS preference. */
export function useReducedMotion(): boolean {
  const system = useSyncExternalStore(subscribe, () => query?.matches ?? false);
  const pref = useUi((s) => s.prefs.motion ?? "system");
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return system;
}
