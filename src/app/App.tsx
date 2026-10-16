import { MotionConfig } from "motion/react";
import { useEffect, useLayoutEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { BrandEmblem } from "@/components/ui/BrandEmblem";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUi } from "@/stores/ui";
import { errorMessage } from "@/stores/toasts";
import { bootstrap } from "./initialization/bootstrap";
import { DirectionProvider } from "@radix-ui/react-direction";
import { cn } from "@/utils/cn";
import { activateLanguage, isRtlLanguage, messages, usePreferredLanguage, type Language } from "@/i18n";

export function App() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const motion = useUi((s) => s.prefs.motion ?? "system");
  const lang = usePreferredLanguage();
  // Idempotent: children rendered below must already see the chosen language.
  activateLanguage(lang);
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtlLanguage(lang) ? "rtl" : "ltr";
  }, [lang]);
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
          <p className="font-display text-heading font-light glow">{messages().app.couldNotStart}</p>
          <p className="mt-2 text-body text-ink-3">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {ready && <Shell motion={motion} lang={lang} />}
      <IntroOverlay ready={ready} />
    </>
  );
}

function Shell({ motion, lang }: { motion: string; lang: Language }) {
  return (
    <MotionConfig reducedMotion={motion === "reduced" ? "always" : motion === "full" ? "never" : "user"}>
      <DirectionProvider dir={isRtlLanguage(lang) ? "rtl" : "ltr"}>
        <TooltipProvider>
          {/* A language change remounts the shell so every label, date and digit updates together. */}
          <AppShell key={lang} />
        </TooltipProvider>
      </DirectionProvider>
    </MotionConfig>
  );
}

/** The start-up mark: the disc slides out of its sleeve and the logo lights up. */
function SplashMark({ animate }: { animate: boolean }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <BrandEmblem size={120} motion={animate ? "intro" : "static"} />
      <span className="brand-wordmark text-[26px] text-ink animate-[fade-in_900ms_var(--ease-out)_300ms_both]">RYLORA</span>
    </div>
  );
}

/** Time the intro started (module load), so it plays once per launch across Splash and the overlay. */
const STARTED = performance.now();
const INTRO_MS = 1500;

/**
 * Start-up screen: shown while the app loads, and kept until the intro has played
 * once; then it fades into the app. One element throughout, so the animation never restarts.
 */
function IntroOverlay({ ready }: { ready: boolean }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"show" | "fade" | "done">("show");
  useEffect(() => {
    if (!ready || phase !== "show") return;
    if (reduced) {
      setPhase("done");
      return;
    }
    const wait = Math.max(0, INTRO_MS - (performance.now() - STARTED));
    const fade = window.setTimeout(() => setPhase("fade"), wait);
    const done = window.setTimeout(() => setPhase("done"), wait + 450);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [ready, phase, reduced]);
  if (phase === "done") return null;
  return (
    <div
      aria-hidden={ready}
      aria-busy={!ready}
      aria-label={ready ? undefined : messages().app.starting}
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-obsidian transition-opacity duration-[450ms] ease-(--ease-out)",
        phase === "fade" && "pointer-events-none opacity-0",
      )}
    >
      <SplashMark animate={!reduced} />
    </div>
  );
}
