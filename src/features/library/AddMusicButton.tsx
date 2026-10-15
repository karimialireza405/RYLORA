import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { useT } from "@/i18n";

/**
 * The single, always-visible way to bring your own music into RYLORA:
 * a folder (kept in sync on every scan) or individual files.
 */
export function AddMusicButton({ variant = "primary", className, full }: { variant?: "primary" | "secondary"; className?: string; full?: boolean }) {
  const t = useT();
  const busy = useLibrary((s) => s.scanning || s.importing);
  return (
    <Button
      variant={variant}
      icon={busy ? LoaderCircle : Plus}
      aria-haspopup="dialog"
      onClick={() => useUi.setState({ addMusicOpen: true })}
      className={cn(
        full && "w-full",
        className,
      )}
    >
      {busy ? t.addMusic.busy : t.addMusic.button}
    </Button>
  );
}
