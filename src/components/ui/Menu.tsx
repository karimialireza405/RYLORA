import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

/**
 * A menu described as data, rendered as either a right-click context menu or a
 * button-triggered dropdown, so both entry points always offer the same actions.
 */
export type MenuEntry =
  | { type: "item"; label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { type: "sub"; label: string; icon?: LucideIcon; children: MenuEntry[] }
  | { type: "separator" }
  | { type: "label"; label: string };

const contentClass =
  "z-[90] min-w-[220px] max-h-[min(70vh,var(--radix-context-menu-content-available-height,480px))] overflow-y-auto rounded-lg bg-raised p-1.5 text-body shadow-popover outline-none data-[state=open]:animate-[pop-in_140ms_var(--ease-out)]";
const itemClass =
  "relative flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-ink-2 outline-none select-none data-[highlighted]:bg-lifted data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

type Primitives = typeof ContextMenu | typeof DropdownMenu;

function Entries({ entries, P }: { entries: MenuEntry[]; P: Primitives }) {
  return (
    <>
      {entries.map((entry, i) => {
        switch (entry.type) {
          case "separator":
            return <P.Separator key={i} className="mx-1 my-1.5 h-px bg-line-strong" />;
          case "label":
            return (
              <P.Label key={i} className="px-2.5 pt-1.5 pb-1 caps text-[10px] text-ink-4 uppercase">
                {entry.label}
              </P.Label>
            );
          case "sub":
            return (
              <P.Sub key={i}>
                <P.SubTrigger className={cn(itemClass, "data-[state=open]:bg-lifted data-[state=open]:text-ink")}>
                  {entry.icon && <entry.icon className="size-4 text-ink-3" aria-hidden />}
                  <span className="flex-1 truncate">{entry.label}</span>
                  <ChevronRight className="size-4 text-ink-4" aria-hidden />
                </P.SubTrigger>
                <P.Portal>
                  <P.SubContent className={cn(contentClass, "max-w-[300px]")} sideOffset={6} alignOffset={-6} collisionPadding={8}>
                    <Entries entries={entry.children} P={P} />
                  </P.SubContent>
                </P.Portal>
              </P.Sub>
            );
          default:
            return (
              <P.Item
                key={i}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
                className={cn(itemClass, entry.danger && "text-danger data-[highlighted]:bg-danger/12 data-[highlighted]:text-danger")}
              >
                {entry.icon && <entry.icon className={cn("size-4", entry.danger ? "text-danger" : "text-ink-3")} aria-hidden />}
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.hint && <span className="text-caption text-ink-4">{entry.hint}</span>}
              </P.Item>
            );
        }
      })}
    </>
  );
}

export function ContextMenuArea({ entries, children, onOpenChange }: { entries: () => MenuEntry[]; children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  return (
    <ContextMenu.Root onOpenChange={onOpenChange} modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={contentClass} collisionPadding={8}>
          <LazyEntries build={entries} P={ContextMenu} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function DropdownMenuButton({
  entries,
  children,
  align = "end",
  onOpenChange,
}: {
  entries: () => MenuEntry[];
  children: ReactNode;
  align?: "start" | "end" | "center";
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu.Root onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={contentClass} align={align} sideOffset={6} collisionPadding={8}>
          <LazyEntries build={entries} P={DropdownMenu} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Entries are built only when the menu opens, keeping long lists cheap. */
function LazyEntries({ build, P }: { build: () => MenuEntry[]; P: Primitives }) {
  return <Entries entries={build()} P={P} />;
}
