import { language, messages } from "@/i18n";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** ASCII digits in the active language's script ("3:07" → "۳:۰۷" in Persian). */
export function localizeDigits(text: string): string {
  if (language() !== "fa") return text;
  return text.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

/** A count in the active language, with grouping ("1,204" / "۱٬۲۰۴"). */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(language() === "fa" ? "fa-IR" : "en-US").format(n);
}

/** A 0–100 value as a percentage in the active language ("50%" / "۵۰٪"). */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(language() === "fa" ? "fa-IR" : "en-US", { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
}

/** `3:07`, `1:02:45`. Negative or invalid input renders as `0:00`. */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return localizeDigits(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`);
}

/** Human summary for collections: `48 min`, `2 hr 5 min`. */
export function formatLongDuration(ms: number): string {
  const d = messages().duration;
  const totalMin = Math.round(Math.max(0, ms) / 60000);
  if (totalMin < 1) return ms > 0 ? d.underAMinute : d.minutes(0);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return d.minutes(m);
  return m === 0 ? d.hours(h) : d.hoursMinutes(h, m);
}

/** English count with a regular plural; dictionaries build their counts from this. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`;
}

/** `Today`, `Yesterday`, `3 days ago`, then a short date (Solar Hijri in Persian). */
export function formatRelativeDate(epochMs: number, now = Date.now()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const t = messages().dates;
  const fa = language() === "fa";
  const days = Math.round((startOfDay(now) - startOfDay(epochMs)) / 86_400_000);
  if (days <= 0) return t.today;
  if (days === 1) return t.yesterday;
  if (days < 7) return new Intl.RelativeTimeFormat(fa ? "fa-IR" : "en-US", { numeric: "auto" }).format(-days, "day");
  return new Date(epochMs).toLocaleDateString(fa ? "fa-IR-u-ca-persian" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function greeting(date = new Date()): string {
  const g = messages().greeting;
  const h = date.getHours();
  if (h < 5) return g.lateNight;
  if (h < 12) return g.morning;
  if (h < 18) return g.afternoon;
  return g.evening;
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
