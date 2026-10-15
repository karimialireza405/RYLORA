import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useId, type ReactNode } from "react";

import { cn } from "@/utils/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[80] bg-obsidian/70 backdrop-blur-[3px] data-[state=open]:animate-[fade-in_180ms_var(--ease-out)]" />
        <RadixDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-[81] w-[min(440px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2",
            "max-h-[calc(100dvh-48px)] overflow-y-auto rounded-xl bg-deep p-6 shadow-popover outline-none data-[state=open]:animate-[dialog-in_220ms_var(--ease-emphasized)]",
            className,
          )}
        >
          <RadixDialog.Title className="font-display text-title font-normal tracking-[-0.01em] text-ink">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1.5 text-body text-ink-3">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-5">{children}</div>
          <RadixDialog.Close
            className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  autoFocus,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  autoFocus?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const errorId = useId();
  return (
    <label className="block">
      <span className="mb-1.5 block text-meta font-medium text-ink-2">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        maxLength={maxLength}
        dir="auto"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-10 w-full rounded-md bg-lifted px-3 text-body text-ink ring-1 ring-line-strong transition-shadow ring-inset placeholder:text-ink-3",
          "focus-visible:ring-2 focus-visible:ring-blue-soft focus-visible:outline-none",
          error && "ring-danger/70",
        )}
      />
      {error && (
        <span id={errorId} className="mt-1.5 block text-meta text-danger" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
