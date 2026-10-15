/**
 * Interface language. Dictionaries are plain typed objects: `en` is the source of
 * truth and `fa` must provide every entry (enforced by the `Messages` type), so a
 * missing translation is a compile error rather than a blank label.
 *
 * Changing the language remounts the app shell (see App.tsx), so modules may read
 * the active language synchronously through `messages()` / `language()`.
 */
import { useUi } from "@/stores/ui";
import { en, type Messages } from "./en";
import { fa } from "./fa";

export type Language = "fa" | "en";
export type { Messages };

export const DEFAULT_LANGUAGE: Language = "fa";

const dictionaries: Record<Language, Messages> = { en, fa };

let active: Language = "en";

/** Make `language` current for messages and formatting. Idempotent. */
export function activateLanguage(language: Language): void {
  active = language;
}

export function language(): Language {
  return active;
}

export function isRtlLanguage(language: Language = active): boolean {
  return language === "fa";
}

/** Messages for code outside React (stores, toasts, menus built on demand). */
export function messages(): Messages {
  return dictionaries[active];
}

/** Messages for components; re-renders when the language preference changes. */
export function useT(): Messages {
  useUi((s) => s.prefs.language);
  return dictionaries[active];
}

/** The language chosen in Settings, or the default (Persian). */
export function usePreferredLanguage(): Language {
  return useUi((s) => s.prefs.language ?? DEFAULT_LANGUAGE);
}
