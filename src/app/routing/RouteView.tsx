import { AnimatePresence, motion } from "motion/react";

import { AlbumPage } from "@/features/albums/AlbumPage";
import { ArtistPage } from "@/features/artists/ArtistPage";
import { HomePage } from "@/features/home/HomePage";
import { LibraryPage } from "@/features/library/LibraryPage";
import { NowPlayingPage } from "@/features/player/NowPlayingPage";
import { PlaylistPage } from "@/features/playlists/PlaylistPage";
import { PlaylistsPage } from "@/features/playlists/PlaylistsPage";
import { SearchPage } from "@/features/search/SearchPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { useNavigation, type Route } from "@/stores/navigation";

function render(route: Route) {
  switch (route.name) {
    case "home":
      return <HomePage />;
    case "search":
      return <SearchPage />;
    case "library":
      return <LibraryPage tab={route.tab} />;
    case "album":
      return <AlbumPage id={route.id} />;
    case "artist":
      return <ArtistPage id={route.id} />;
    case "playlists":
      return <PlaylistsPage />;
    case "playlist":
      return <PlaylistPage id={route.id} />;
    case "nowPlaying":
      return <NowPlayingPage />;
    case "settings":
      return <SettingsPage />;
  }
}

/** Keyed by history position so back/forward re-enter pages with a short fade. */
export function RouteView() {
  const index = useNavigation((s) => s.index);
  const route = useNavigation((s) => s.stack[s.index]!);
  // Library tabs swap in place without a page transition.
  const key = route.name === "library" ? "library" : `${index}:${JSON.stringify(route)}`;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.09 } }}
        className="min-h-full"
      >
        {render(route)}
      </motion.div>
    </AnimatePresence>
  );
}
