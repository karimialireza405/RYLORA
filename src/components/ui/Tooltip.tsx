import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={450} skipDelayDuration={250}>
    {children}
  </RadixTooltip.Provider>
);

interface TooltipProps {
  label: ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}

export function Tooltip({ label, shortcut, side = "top", children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="z-[100] flex items-center gap-2 rounded-md bg-lifted px-2.5 py-1.5 text-caption font-medium text-ink shadow-popover data-[state=delayed-open]:animate-[tooltip-in_140ms_var(--ease-out)]"
        >
          {label}
          {shortcut && <kbd className="font-sans text-caption text-ink-3">{shortcut}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
