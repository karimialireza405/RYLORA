import { create } from "zustand";

import { messages } from "@/i18n";
import { backend } from "@/services/backend";
import type { UpdateInfo, UpdateProgress, UpdateStatus } from "@/types/domain";
import { navigate } from "./navigation";
import { notifyError, toast } from "./toasts";

type Phase = "idle" | "checking" | "upToDate" | "available" | "installing" | "error";

interface UpdatesState {
  status: UpdateStatus | null;
  phase: Phase;
  update: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
}

export const useUpdates = create<UpdatesState>(() => ({ status: null, phase: "idle", update: null, progress: null, error: null }));

export async function loadUpdateStatus(): Promise<UpdateStatus | null> {
  try {
    const status = await backend().updates.status();
    useUpdates.setState({ status });
    return status;
  } catch {
    return null;
  }
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  useUpdates.setState({ phase: "checking", error: null });
  try {
    const update = await backend().updates.check();
    useUpdates.setState({ phase: update ? "available" : "upToDate", update });
    return update;
  } catch (e) {
    useUpdates.setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function installUpdate(): Promise<void> {
  useUpdates.setState({ phase: "installing", progress: null });
  try {
    await backend().updates.install();
  } catch (e) {
    useUpdates.setState({ phase: "available" });
    notifyError(messages().settings.updateFailed, e);
  }
}

export function onUpdateProgress(progress: UpdateProgress): void {
  useUpdates.setState({ progress });
}

/** The once-per-launch check, when the user turned automatic checks on. */
export async function checkOnLaunch(enabled: boolean): Promise<void> {
  if (!enabled) return;
  const status = await loadUpdateStatus();
  if (!status?.configured) return;
  const update = await checkForUpdates();
  if (update) {
    toast(
      {
        tone: "info",
        title: messages().settings.updateAvailable(update.version),
        action: { label: messages().settings.viewUpdate, run: () => navigate({ name: "settings" }) },
      },
      12_000,
    );
  }
}
