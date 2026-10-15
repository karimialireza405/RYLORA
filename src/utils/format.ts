/** `3:07`, `1:02:45`. Negative or invalid input renders as `0:00`. */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Human summary for collections: `48 min`, `2 hr 5 min`. */
export function formatLongDuration(ms: number): string {
  const totalMin = Math.round(Math.max(0, ms) / 60000);
  if (totalMin < 1) return ms > 0 ? "< 1 min" : "0 min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : pluralForm}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** `Today`, `Yesterday`, `3 days ago`, then a short date. */
export function formatRelativeDate(epochMs: number, now = Date.now()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(epochMs)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return rtf.format(-days, "day");
  return new Date(epochMs).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Late night listening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Wrap text in Unicode first-strong isolates so its direction is resolved on its own.
 * Without this, "سایه‌ها · 2021" in a left-to-right line is displayed as "2021 · سایه‌ها".
 */
export function isolate(text: string | number): string {
  return `⁨${text}⁩`;
}

/** Join metadata parts ("Artist · 2021") with each part isolated; empty parts are dropped. */
export function joinMeta(parts: (string | number | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string | number => p !== null && p !== undefined && p !== false && p !== "")
    .map(isolate)
    .join(" · ");
}

/** True when the string's first strong character is right-to-left (Persian, Arabic, Hebrew). */
export function isRtl(text: string): boolean {
  const match = text.match(/[A-Za-zÀ-ɏ֐-ࣿיִ-﷿ﹰ-﻿]/);
  return !!match && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(match[0]);
}
