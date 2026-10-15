import { FolderPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Toaster } from "@/components/feedback/Toaster";
import { QueuePanel } from "@/features/queue/QueuePanel";
import { ImmersivePlayer } from "@/features/player/ImmersivePlayer";
import { NewPlaylistDialog } from "@/features/playlists/NewPlaylistDialog";
import { AddMusicDialog } from "@/features/library/AddMusicDialog";
import { EditTrackDialog } from "@/features/library/EditTrackDialog";
import { ShortcutsDialog } from "@/features/settings/ShortcutsDialog";
import { SoundDialog } from "@/features/sound/SoundDialog";
import { useNavigation } from "@/stores/navigation";
import { useRoute } from "@/stores/navigation";
import { usePlayer } from "@/stores/player";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ListeningPanel } from "@/features/player/ListeningPanel";
import { useUi } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { RouteView } from "@/app/routing/RouteView";
import { PlaybackBar } from "./PlaybackBar";
import { ScrollContext } from "./ScrollContext";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { useT } from "@/i18n";

export function AppShell() {
  const t = useT();
  const scrollRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const queueOpen = useUi((s) => s.queueOpen);
  const immersive = useUi((s) => s.immersive);
  const dropActive = useUi((s) => s.dropActive);
  const panelOpen = useUi((s) => s.nowPlayingPanelOpen);
  const draggedTracks = useUi((s) => s.dragTrackIds.length);
  const current = usePlayer((s) => s.current);
  const wide = useMediaQuery("(min-width: 1320px)");
  const route = useRoute();
  const showPanel =
    wide &&
    (panelOpen || queueOpen) &&
    current &&
    route.name !== "home" &&
    route.name !== "nowPlaying" &&
    route.name !== "settings";
  useScrollRestoration(scrollRef);

  return (
    <ScrollContext.Provider value={scrollRef}>
      <div
        className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] bg-obsidian"
        inert={immersive || undefined}
      >
        <div className="flex min-h-0">
          <div className="w-[var(--sidebar-width)] shrink-0">
            <Sidebar />
          </div>
          <div className="relative min-w-0 flex-1">
            <TitleBar scrolled={scrolled} />
            <div className="flex h-full min-h-0 pt-[var(--titlebar-height)]">
              <main
                ref={scrollRef}
                id="content"
                tabIndex={-1}
                className="relative h-full min-w-0 flex-1 overflow-y-auto overscroll-contain"
                onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
              >
                <RouteView />
              </main>
              {showPanel ? (
                <ListeningPanel />
              ) : queueOpen ? (
                <QueuePanel />
              ) : null}
            </div>
          </div>
        </div>
        <PlaybackBar />
      </div>

      <AnimatePresence>
        {immersive && <ImmersivePlayer key="immersive" />}
      </AnimatePresence>
      <NewPlaylistDialog />
      <AddMusicDialog />
      <EditTrackDialog />
      <ShortcutsDialog />
      <SoundDialog />
      <Toaster />
      {draggedTracks > 0 && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-md bg-raised px-5 py-3 text-body shadow-popover"
        >
          {t.shell.dragging(draggedTracks)}
        </div>
      )}
      <AnimatePresence>
        {dropActive && <DropOverlay key="drop" />}
      </AnimatePresence>
    </ScrollContext.Provider>
  );
}

/** Remember scroll position per history entry; restore it on back/forward. */
function useScrollRestoration(ref: React.RefObject<HTMLElement | null>) {
  const index = useNavigation((s) => s.index);
  const positions = useRef(new Map<number, number>());
  const previous = useRef(index);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    positions.current.set(previous.current, el.scrollTop);
    previous.current = index;
    const target = positions.current.get(index) ?? 0;
    // Wait a frame so the incoming page has laid out before restoring.
    requestAnimationFrame(() => {
      el.scrollTop = target;
    });
  }, [index, ref]);
}

function DropOverlay() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center bg-obsidian/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center rounded-2xl px-12 py-10 text-center ring-2 ring-blue-soft/60 ring-inset">
        <FolderPlus
          className="mb-4 size-10 text-blue-soft"
          strokeWidth={1.6}
          aria-hidden
        />
        <p className="font-display text-heading font-light glow">
          {t.shell.dropTitle}
        </p>
        <p className="mt-1 text-body text-ink-3">
          {t.shell.dropHint}
        </p>
      </div>
    </motion.div>
  );
}

/** Standard page padding and width. Pages may opt out for full-bleed headers. */
export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1680px] px-6 pt-6 pb-10", className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  overline,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  overline?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {overline && (
          <p className="mb-2 caps text-[10px] text-ink-4 uppercase">
            {overline}
          </p>
        )}
        <h1 className="font-display text-display font-light glow tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-body text-ink-3">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </div>
  );
}
