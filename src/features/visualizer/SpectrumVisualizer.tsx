import { useReducedMotion } from "@/hooks/useReducedMotion";
import { prefEnabled, useUi } from "@/stores/ui";
import { AudioScene } from "./AudioScene";

interface Props {
  variant?: "bars" | "mirror";
  className?: string;
  coarse?: boolean;
}
/** A cover-coloured perspective particle field, driven by the native FFT. */
export function SpectrumVisualizer({
  variant = "bars",
  className,
  coarse,
}: Props) {
  const enabled = useUi((s) => prefEnabled(s.prefs, "visualizer"));
  const reduced = useReducedMotion();
  if (!enabled || reduced) return null;
  return (
    <AudioScene
      mode="spectrum"
      mirrored={variant === "mirror"}
      className={className}
      coarse={coarse}
    />
  );
}
