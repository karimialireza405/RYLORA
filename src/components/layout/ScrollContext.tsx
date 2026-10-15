import { createContext, useContext, useLayoutEffect, useState, type RefObject } from "react";

/** The shell's main scroll container, shared so virtualized lists can use page scrolling. */
export const ScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useScrollContainer(): RefObject<HTMLElement | null> {
  const ref = useContext(ScrollContext);
  if (!ref) throw new Error("useScrollContainer must be used inside the app shell");
  return ref;
}

/**
 * Offset of `element` from the top of the scroll container's content, kept up to date
 * as layout above it changes. Used as `scrollMargin` for page-level virtualization.
 */
export function useOffsetWithin(element: RefObject<HTMLElement | null>, container: RefObject<HTMLElement | null>): number {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    const el = element.current;
    const root = container.current;
    if (!el || !root) return;
    const measure = () => {
      const next = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      setOffset((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (root.firstElementChild) ro.observe(root.firstElementChild);
    return () => ro.disconnect();
  }, [element, container]);
  return offset;
}
