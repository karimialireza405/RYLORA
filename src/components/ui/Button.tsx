import type { LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/utils/cn";
import { Tooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-blue-soft text-obsidian hover:bg-accent-hover active:bg-blue",
  secondary: "bg-raised text-ink ring-1 ring-inset ring-line-strong hover:bg-lifted active:bg-raised",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink active:bg-lifted",
  danger: "bg-danger/12 text-danger ring-1 ring-inset ring-danger/25 hover:bg-danger/20",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3.5 text-meta",
  md: "h-10 gap-2 px-5 text-body",
  lg: "h-12 gap-2.5 px-7 text-lead",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap",
        "transition-[background-color,color,transform,box-shadow] duration-(--duration-micro) ease-(--ease-out)",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === "lg" ? "size-5" : "size-4"} strokeWidth={2.2} aria-hidden />}
      {children}
    </button>
  );
});

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  size?: "xs" | "sm" | "md" | "lg";
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  /** Hide the tooltip (e.g. when the label is visible elsewhere). */
  noTooltip?: boolean;
  iconClassName?: string;
}

const iconSizes = {
  xs: ["size-7", "size-3.5"],
  sm: ["size-8", "size-4"],
  md: ["size-9", "size-[18px]"],
  lg: ["size-11", "size-5"],
} as const;

/** Icon-only control. Always has an accessible label and (by default) a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, size = "md", active, tooltipSide, noTooltip, className, iconClassName, type = "button", ...rest },
  ref,
) {
  const [box, glyph] = iconSizes[size];
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        "transition-[background-color,color,transform] duration-(--duration-micro) ease-(--ease-out)",
        "active:scale-[0.92] disabled:pointer-events-none disabled:opacity-35",
        active ? "text-blue-soft hover:bg-blue/12" : "text-ink-3 hover:bg-raised hover:text-ink",
        box,
        className,
      )}
      {...rest}
    >
      <Icon className={cn(glyph, iconClassName)} strokeWidth={2} aria-hidden />
      {/* Toggles also show a dot so state is not conveyed by colour alone. */}
      {active && <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-blue-soft" aria-hidden />}
    </button>
  );
  if (noTooltip) return button;
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
