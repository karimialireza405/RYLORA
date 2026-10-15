import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";

import mark from "@/assets/brand/mark.svg";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUi } from "@/stores/ui";
import { errorMessage } from "@/stores/toasts";
import { bootstrap } from "./initialization/bootstrap";

export function App() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const motion = useUi((s) => s.prefs.motion ?? "system");
  useKeyboardShortcuts();

  useEffect(() => {
    bootstrap()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <p className="font-display text-heading font-light glow">RYLORA couldn’t start</p>
          <p className="mt-2 text-body text-ink-3">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) return <Splash />;

  return (
    <MotionConfig reducedMotion={motion === "reduced" ? "always" : motion === "full" ? "never" : "user"}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </MotionConfig>
  );
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Starting RYLORA">
      <img src={mark} alt="" className="size-12 animate-[fade-in_400ms_var(--ease-out)] opacity-90" />
    </div>
  );
}
