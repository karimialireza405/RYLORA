import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Disc3,
  Heart,
  Home,
  Mic2,
  Music2,
  Plus,
  Radio,
  Search,
  Settings,
} from "lucide-react";
import { motion } from "motion/react";

import { BrandEmblem } from "@/components/ui/BrandEmblem";
import { Mosaic } from "@/components/ui/Artwork";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { ContextMenuArea } from "@/components/ui/Menu";
import { albumMenu } from "@/features/library/Cards";
import { pinnedAlbumIds } from "@/features/library/pins";
import { AddMusicButton } from "@/features/library/AddMusicButton";
import { IconButton } from "@/components/ui/Button";
import { useLibrary } from "@/stores/library";
import { navigate, useRoute, type Route } from "@/stores/navigation";
import { usePlayer } from "@/stores/player";
import { openNewPlaylist, useUi } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { useT, type Messages } from "@/i18n";
import { formatNumber } from "@/utils/format";

interface NavItemDef {
  label: keyof Messages["nav"];
  icon: LucideIcon;
  route: Route;
  match: (r: Route) => boolean;
}

const MAIN: NavItemDef[] = [
  {
    label: "home",
    icon: Home,
    route: { name: "home" },
    match: (r) => r.name === "home",
  },
  {
    label: "search",
    icon: Search,
    route: { name: "search" },
    match: (r) => r.name === "search",
  },
  {
    label: "nowPlaying",
    icon: Radio,
    route: { name: "nowPlaying" },
    match: (r) => r.name === "nowPlaying",
  },
];

const LIBRARY: NavItemDef[] = [
  {
    label: "songs",
    icon: Music2,
    route: { name: "library", tab: "songs" },
    match: (r) => r.name === "library" && r.tab === "songs",
  },
  {
    label: "albums",
    icon: Disc3,
    route: { name: "library", tab: "albums" },
    match: (r) =>
      (r.name === "library" && r.tab === "albums") || r.name === "album",
  },
  {
    label: "artists",
    icon: Mic2,
    route: { name: "library", tab: "artists" },
    match: (r) =>
      (r.name === "library" && r.tab === "artists") || r.name === "artist",
  },
  {
    label: "favorites",
    icon: Heart,
    route: { name: "library", tab: "favorites" },
    match: (r) => r.name === "library" && r.tab === "favorites",
  },
  {
    label: "recentlyAdded",
    icon: Clock,
    route: { name: "library", tab: "recent" },
    match: (r) => r.name === "library" && r.tab === "recent",
  },
];

export function Sidebar() {
  const t = useT();
  const route = useRoute();
  const playlists = useLibrary((s) => s.playlists);
  const scanning = useLibrary((s) => s.scanning);
  const progress = useLibrary((s) => s.scanProgress);
  const hasTrack = usePlayer((s) => s.current !== null);
  const pinIds = useUi((s) => s.prefs.pinnedAlbums);
  const albums = useLibrary((s) => s.albumById);
  const pins = pinnedAlbumIds(pinIds).flatMap((id) => {
    const a = albums.get(id);
    return a ? [a] : [];
  });

  return (
    <nav
      aria-label={t.nav.main}
      className="flex h-full min-h-0 flex-col border-e border-line bg-base"
    >
      <div
        data-tauri-drag-region
        className="drag-region flex h-[var(--titlebar-height)] shrink-0 items-center gap-2.5 px-5"
      >
        <BrandEmblem size={26} />
        <span className="brand-wordmark text-ink">RYLORA</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-3 pb-3">
        <NavGroup
          items={MAIN.filter((i) => i.route.name !== "nowPlaying" || hasTrack)}
          route={route}
        />
        <SectionLabel>{t.nav.yourLibrary}</SectionLabel>
        <NavGroup items={LIBRARY} route={route} />

        <div className="mt-6 mb-1.5 flex items-center justify-between pe-1 ps-3">
          <button
            type="button"
            onClick={() => navigate({ name: "playlists" })}
            className={cn(
              "text-caption font-semibold hover:text-ink-2",
              route.name === "playlists" ? "text-ink-2" : "text-ink-4",
            )}
          >
            {t.nav.playlists}
          </button>
          <IconButton
            icon={Plus}
            label={t.nav.newPlaylist}
            size="xs"
            onClick={() => openNewPlaylist()}
          />
        </div>
        <ul className="space-y-0.5">
          {playlists.map((p) => {
            const active = route.name === "playlist" && route.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => navigate({ name: "playlist", id: p.id })}
                  data-track-drop="playlist"
                  data-playlist-id={p.id}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 w-full items-center gap-3 rounded-md px-2 text-start transition-colors duration-(--duration-micro)",
                    active
                      ? "bg-raised text-ink"
                      : "text-ink-2 hover:bg-raised/60 hover:text-ink",
                  )}
                >
                  <LibraryCover
                    hash={p.artworks[0]}
                    seed={p.name}
                    inset={
                      <Mosaic
                        hashes={p.artworks}
                        seed={p.name}
                        className="h-full w-full rounded-none"
                      />
                    }
                    className="h-8 w-[42px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="bidi block truncate text-meta font-medium"
                    >
                      {p.name}
                    </span>
                    <span className="block truncate text-caption text-ink-4">
                      {t.count.songs(p.trackCount)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {playlists.length === 0 && (
            <li className="px-3 py-2 text-meta text-ink-4">
              <button
                type="button"
                className="text-start hover:text-ink-2"
                onClick={() => openNewPlaylist()}
              >
                {t.nav.firstPlaylist}
              </button>
            </li>
          )}
        </ul>
        {pins.length > 0 && (
          <>
            <SectionLabel>{t.nav.pins}</SectionLabel>
            <ul className="space-y-1">
              {pins.map((album) => (
                <li key={album.id}>
                  <ContextMenuArea entries={() => albumMenu(album)}>
                    <button
                      type="button"
                      onClick={() => navigate({ name: "album", id: album.id })}
                      className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-start hover:bg-raised"
                      title={album.title}
                    >
                      <LibraryCover
                        hash={album.artwork}
                        seed={album.title}
                        className="h-8 w-[42px]"
                      />
                      <span className="bidi min-w-0 truncate text-meta">
                        {album.title}
                      </span>
                    </button>
                  </ContextMenuArea>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-3 py-3">
        {scanning && (
          <div className="mb-2 px-2">
            <div className="flex items-center justify-between text-caption text-ink-3">
              <span role="status" className="flex items-center gap-2">
                <BrandEmblem size={18} motion="spin" glow={false} />
                {progress?.phase === "discovering" || !progress
                  ? t.nav.lookingForMusic
                  : t.nav.indexing}
              </span>
              {progress && progress.total > 0 && (
                <span className="tabular" aria-hidden>
                  {formatNumber(progress.processed)}/{formatNumber(progress.total)}
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-lifted">
              <div
                className={cn(
                  "h-full rounded-full bg-blue-soft shadow-[0_0_8px_color-mix(in_srgb,var(--now-tint)_60%,transparent)] transition-[width] duration-300",
                  (!progress || !progress.total) && "w-1/3 animate-pulse",
                )}
                style={
                  progress && progress.total
                    ? {
                        width: `${Math.max(4, (progress.processed / progress.total) * 100)}%`,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        )}
        <AddMusicButton
          full
          variant="secondary"
          className="mb-2 justify-start! px-3!"
        />
        <NavGroup
          items={[
            {
              label: "settings",
              icon: Settings,
              route: { name: "settings" },
              match: (r) => r.name === "settings",
            },
          ]}
          route={route}
        />
      </div>
    </nav>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mt-5 mb-2 px-3 text-caption font-semibold text-ink-3">
      {children}
    </p>
  );
}

function NavGroup({ items, route }: { items: NavItemDef[]; route: Route }) {
  const t = useT();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.match(route);
        return (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => navigate(item.route)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-(--duration-micro)",
                active
                  ? "text-blue-soft"
                  : "text-ink-2 hover:bg-raised/60 hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="nav-indicator absolute inset-0 rounded-md bg-raised before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-blue-soft"
                  transition={{ type: "spring", stiffness: 480, damping: 40 }}
                ></motion.span>
              )}
              <item.icon
                className={cn(
                  "relative size-[18px]",
                  active && "text-blue-soft",
                )}
                strokeWidth={1.7}
                aria-hidden
              />
              <span className="relative">{t.nav[item.label]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
