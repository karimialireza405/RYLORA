import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { messages } from "@/i18n";

import { cn } from "@/utils/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      <SleeveIcon icon={Icon} />
      <h2 className="font-display text-title font-normal tracking-[-0.01em] text-ink">{title}</h2>
      {description && <p className="mt-2 max-w-[44ch] text-body text-ink-3 text-balance">{description}</p>}
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}

/** The brand's die-cut sleeve, small: the icon is printed on the sleeve and the disc peeks out. */
function SleeveIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div aria-hidden className="relative mb-6 h-16 w-[92px] [filter:drop-shadow(0_6px_14px_rgb(0_0_0/0.55))]">
      <div className="absolute -inset-4 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--now-tint)_22%,transparent),transparent)] blur-md" />
      <div
        className="absolute inset-y-[3px] right-0 aspect-square rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] motion-safe:animate-[spin_9s_linear_infinite]"
        style={{
          background:
            "radial-gradient(circle, var(--now-tint) 0 17%, #121317 18% 20%, transparent 21%), repeating-radial-gradient(circle, #1a1b1f 0 1px, #25262b 1px 2px, #16171a 2px 4px)",
        }}
      />
      <div
        className="absolute inset-y-0 left-0 flex aspect-square items-center justify-center rounded-[3px]"
        style={{
          background: "linear-gradient(135deg, #f4f6f9, #c6ccd6)",
          maskImage: "radial-gradient(circle at 100% 50%, transparent 9px, #000 9.5px)",
          WebkitMaskImage: "radial-gradient(circle at 100% 50%, transparent 9px, #000 9.5px)",
        }}
      >
        <Icon className="mr-2 size-6 text-[#2a2c33]" strokeWidth={1.7} />
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-[linear-gradient(90deg,var(--color-deep)_0%,var(--color-raised)_50%,var(--color-deep)_100%)] bg-[length:200%_100%]",
        "animate-[shimmer_1.6s_linear_infinite]",
        className,
      )}
    />
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-5 gap-y-7" aria-label={messages().collections.loading} role="status">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="mt-3 h-3.5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
