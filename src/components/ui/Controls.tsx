import { motion } from "motion/react";
import { useId } from "react";

import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-body font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-meta text-ink-3">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-(--duration-standard)",
          checked ? "bg-blue" : "bg-lifted ring-1 ring-line-strong ring-inset",
        )}
      >
        <span
          className={cn(
            "inline-block size-[18px] rounded-full bg-ink shadow-sm transition-transform duration-(--duration-standard) ease-(--ease-out)",
            checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  variant?: "pill" | "line";
}

/** Tab-like segmented control with a sliding indicator. Arrow keys move between options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  variant = "pill",
}: SegmentedProps<T>) {
  const group = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        variant === "line"
          ? "inline-flex items-center gap-5"
          : "inline-flex items-center gap-1 rounded-lg bg-deep p-1 ring-1 ring-line ring-inset",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = options.findIndex((o) => o.value === value);
        const next =
          options[
            (i + (e.key === "ArrowRight" ? 1 : options.length - 1)) %
              options.length
          ];
        if (next) {
          onChange(next.value);
          (
            e.currentTarget.querySelector(
              `[data-value="${next.value}"]`,
            ) as HTMLElement | null
          )?.focus();
        }
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            data-value={o.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative text-body font-medium transition-colors duration-(--duration-standard)",
              variant === "line" ? "h-11 px-1" : "h-8 rounded-md px-3",
              selected ? "text-blue-soft" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${group}`}
                className={
                  variant === "line"
                    ? "absolute inset-x-0 bottom-0 h-px bg-blue-soft shadow-accent-line"
                    : "absolute inset-0 rounded-md bg-raised ring-1 ring-line-strong ring-inset"
                }
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            )}
            <span className="relative">
              {o.label}
              {o.count !== undefined && (
                <span className="ms-1.5 font-medium text-ink-4">
                  {formatNumber(o.count)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
