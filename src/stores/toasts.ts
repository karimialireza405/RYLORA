import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; run: () => void };
}

let nextId = 1;

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

export function dismissToast(id: number): void {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function toast(t: Omit<Toast, "id">, durationMs = t.tone === "error" ? 6500 : 3800): number {
  const id = nextId++;
  // Keep at most three visible; the oldest yields.
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
  window.setTimeout(() => dismissToast(id), durationMs);
  return id;
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Something went wrong.";
}

export function notifyError(title: string, error: unknown): void {
  console.error(title, error);
  toast({ tone: "error", title, description: errorMessage(error) });
}
