import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

interface DragState {
  from: number;
  to: number;
  offsetY: number;
}

/**
 * Pointer-driven reordering for fixed-height (and virtualized) rows. Shows an
 * insertion target while dragging and auto-scrolls near the container edges.
 */
export function useDragReorder({
  count,
  rowHeight,
  scrollRef,
  onMove,
}: {
  count: number;
  rowHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  onMove: (from: number, to: number) => void;
}) {
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = useCallback((d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const start = useRef<{ y: number; scroll: number; from: number } | null>(null);
  const pointerY = useRef(0);
  const raf = useRef(0);

  const update = useCallback(() => {
    const s = start.current;
    const el = scrollRef.current;
    if (!s || !el) return;
    const dy = pointerY.current - s.y + (el.scrollTop - s.scroll);
    const to = Math.max(0, Math.min(count - 1, Math.round(s.from + dy / rowHeight)));
    setDrag({ from: s.from, to, offsetY: dy });
  }, [count, rowHeight, scrollRef, setDrag]);

  const active = drag !== null;
  useEffect(() => {
    if (!active) return;
    // Auto-scroll while the pointer sits near the top or bottom edge.
    const tick = () => {
      const el = scrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge = 64;
        const y = pointerY.current;
        const speed = y < rect.top + edge ? -(rect.top + edge - y) / 4 : y > rect.bottom - edge ? (y - (rect.bottom - edge)) / 4 : 0;
        if (speed) {
          el.scrollTop += speed;
          update();
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, scrollRef, update]);

  const handleProps = useCallback(
    (index: number) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, scroll: scrollRef.current?.scrollTop ?? 0, from: index };
        pointerY.current = e.clientY;
        setDrag({ from: index, to: index, offsetY: 0 });
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        if (!start.current) return;
        pointerY.current = e.clientY;
        update();
      },
      onPointerUp: () => {
        const d = dragRef.current;
        start.current = null;
        setDrag(null);
        if (d && d.to !== d.from) onMove(d.from, d.to);
      },
      onPointerCancel: () => {
        start.current = null;
        setDrag(null);
      },
    }),
    [onMove, scrollRef, setDrag, update],
  );

  return { drag, handleProps };
}
