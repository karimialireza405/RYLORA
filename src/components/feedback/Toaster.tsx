import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { dismissToast, useToasts, type ToastTone } from "@/stores/toasts";
import { cn } from "@/utils/cn";
import { messages } from "@/i18n";

const icons: Record<ToastTone, typeof Info> = { info: Info, success: CheckCircle2, error: AlertCircle };
const tones: Record<ToastTone, string> = { info: "text-blue-soft", success: "text-success", error: "text-danger" };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed end-5 bottom-[calc(var(--playbar-height)+16px)] z-[95] flex w-[360px] flex-col items-end gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] } }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.14 } }}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full items-start gap-3 rounded-lg bg-raised py-3 pe-2 ps-3.5 shadow-popover"
            >
              <Icon className={cn("mt-0.5 size-[18px] shrink-0", tones[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 line-clamp-3 text-meta break-words text-ink-3">{t.description}</p>}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.run();
                    dismissToast(t.id);
                  }}
                  className="h-7 shrink-0 rounded-full px-3 text-meta font-semibold text-blue-soft hover:bg-blue/12"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label={messages().common.dismissNotification}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-lifted hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
