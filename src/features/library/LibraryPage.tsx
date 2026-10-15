import {
  FolderPlus,
  Heart,
  ListFilter,
  Music2,
  Play,
  Shuffle,
  Grid2X2,
  List,
  MoreHorizontal,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Page, PageHeader } from "@/components/layout/AppShell";
import { CardGridSkeleton, EmptyState } from "@/components/feedback/EmptyState";
import { Button, IconButton } from "@/components/ui/Button";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { ContextMenuArea, DropdownMenuButton } from "@/components/ui/Menu";
import { buildTrackMenu } from "./trackMenu";
import { setPreference, useUi } from "@/stores/ui";
import { Segmented } from "@/components/ui/Controls";
import { useLibrary } from "@/stores/library";
import { navigate, type LibraryTab } from "@/stores/navigation";
import { player, usePlayer } from "@/stores/player";
import type { Track } from "@/types/domain";
import { plural } from "@/utils/format";
import { normalize, sortTracks } from "@/utils/tracks";
import { addFolderInteractive } from "./actions";
import { AddMusicButton } from "./AddMusicButton";
import { AlbumCard, ArtistCard, CardGrid, albumMenu } from "./Cards";
import { playFrom, TrackTable, useSortState } from "./TrackTable";

const RECENT_LIMIT = 250;

const TITLES: Record<LibraryTab, string> = {
  songs: "Songs",
  albums: "Albums",
  artists: "Artists",
  favorites: "Favorites",
  recent: "Recently Added",
};

export function LibraryPage({ tab }: { tab: LibraryTab }) {
  const loaded = useLibrary((s) => s.loaded);
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const countsByTrack = useLibrary((s) => s.playCounts);
  const prefs = useUi((s) => s.prefs);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const { sort, toggle } = useSortState(
    tab === "recent" ? "addedAt" : "default",
    tab !== "recent",
  );
  const effectiveSort =
    tab === "recent" && sort.key === "default"
      ? { key: "addedAt" as const, dir: "desc" as const }
      : sort;

  const needle = normalize(deferredFilter);
  const visibleTracks = useMemo(() => {
    let list: Track[] = tracks;
    if (tab === "favorites") list = list.filter((t) => t.favorite);
    if (tab === "recent")
      list = sortTracks(list, "addedAt", "desc").slice(0, RECENT_LIMIT);
    if (needle)
      list = list.filter((t) =>
        normalize(`${t.title} ${t.artist} ${t.album}`).includes(needle),
      );
    return sortTracks(
      list,
      effectiveSort.key,
      effectiveSort.dir,
      countsByTrack,
    );
  }, [
    tracks,
    tab,
    needle,
    effectiveSort.key,
    effectiveSort.dir,
    countsByTrack,
  ]);

  const visibleAlbums = useMemo(() => {
    const list = needle
      ? albums.filter((a) =>
          normalize(`${a.title} ${a.artist}`).includes(needle),
        )
      : albums;
    return [...list].sort((a, b) =>
      prefs.albumSort === "addedAt"
        ? b.addedAt - a.addedAt
        : prefs.albumSort === "artist"
          ? a.artist.localeCompare(b.artist)
          : a.title.localeCompare(b.title),
    );
  }, [albums, needle, prefs.albumSort]);
  const visibleArtists = useMemo(
    () =>
      needle
        ? artists.filter((a) => normalize(a.name).includes(needle))
        : artists,
    [artists, needle],
  );

  const isTrackTab = tab === "songs" || tab === "favorites" || tab === "recent";
  const layout =
    tab === "albums"
      ? (prefs.albumView ?? "grid")
      : (prefs.libraryView ?? "list");
  const playable = visibleTracks.filter((t) => !t.missing);
  const counts = {
    songs: tracks.length,
    albums: albums.length,
    artists: artists.length,
  };

  return (
    <Page>
      <PageHeader
        title={TITLES[tab]}
        subtitle={
          isTrackTab
            ? plural(visibleTracks.length, "song")
            : tab === "albums"
              ? plural(visibleAlbums.length, "album")
              : plural(visibleArtists.length, "artist")
        }
        actions={
          <>
            {isTrackTab && playable.length > 0 && (
              <>
                <Button
                  variant="primary"
                  icon={Play}
                  onClick={() => playFrom(visibleTracks, 0, player.playTracks)}
                >
                  Play
                </Button>
                <Button
                  variant="secondary"
                  icon={Shuffle}
                  onClick={() => {
                    if (!usePlayer.getState().shuffle) player.toggleShuffle();
                    const start = Math.floor(Math.random() * playable.length);
                    player.playTracks(
                      playable.map((t) => t.id),
                      start,
                    );
                  }}
                >
                  Shuffle
                </Button>
              </>
            )}
            <AddMusicButton variant="secondary" />
          </>
        }
      />

      <div className="library-toolbar">
        <div className="library-tabs">
          <Segmented
            variant="line"
            label="Library view"
            value={tab}
            onChange={(t) =>
              navigate({ name: "library", tab: t }, { replace: true })
            }
            options={[
              { value: "songs", label: "Songs", count: counts.songs },
              { value: "albums", label: "Albums", count: counts.albums },
              { value: "artists", label: "Artists", count: counts.artists },
              { value: "favorites", label: "Favorites" },
              { value: "recent", label: "Recent" },
            ]}
          />
        </div>
        <div className="library-tools">
          <label className="library-filter">
            <ListFilter className="size-4 shrink-0 text-ink-3" aria-hidden />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${TITLES[tab].toLowerCase()}`}
              aria-label={`Filter ${TITLES[tab]}`}
              dir="auto"
            />
          </label>
          <div className="library-view-tools">
            {tab === "albums" && (
              <label className="library-sort">
                <span className="sr-only">Sort albums</span>
                <select
                  aria-label="Sort albums"
                  value={prefs.albumSort ?? "title"}
                  onChange={(e) =>
                    void setPreference(
                      "albumSort",
                      e.target.value as "title" | "artist" | "addedAt",
                    )
                  }
                >
                  <option value="title">Title</option>
                  <option value="artist">Artist</option>
                  <option value="addedAt">Recently added</option>
                </select>
              </label>
            )}
            {isTrackTab && (
              <label className="library-sort">
                <span className="sr-only">Sort songs</span>
                <select
                  aria-label="Sort songs"
                  value={sort.key}
                  onChange={(e) => toggle(e.target.value as typeof sort.key)}
                >
                  <option value="default">Album order</option>
                  <option value="title">Title</option>
                  <option value="artist">Artist</option>
                  <option value="album">Album</option>
                  <option value="addedAt">Recently added</option>
                  <option value="durationMs">Duration</option>
                  <option value="playCount">Most played</option>
                </select>
              </label>
            )}
            {(isTrackTab || tab === "albums") && (
              <div
                role="group"
                aria-label="Collection layout"
                className="library-layout"
              >
                <IconButton
                  size="sm"
                  icon={Grid2X2}
                  label="Grid view"
                  aria-pressed={layout === "grid"}
                  active={layout === "grid"}
                  onClick={() =>
                    void setPreference(
                      tab === "albums" ? "albumView" : "libraryView",
                      "grid",
                    )
                  }
                />
                <IconButton
                  size="sm"
                  icon={List}
                  label="List view"
                  aria-pressed={layout === "list"}
                  active={layout === "list"}
                  onClick={() =>
                    void setPreference(
                      tab === "albums" ? "albumView" : "libraryView",
                      "list",
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {!loaded ? (
        <CardGridSkeleton count={8} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={Music2}
          title="Your library is empty"
          description="Add a folder of music and RYLORA will index it in the background."
        >
          <Button
            variant="primary"
            icon={FolderPlus}
            onClick={() => void addFolderInteractive()}
          >
            Add music folder
          </Button>
        </EmptyState>
      ) : isTrackTab ? (
        visibleTracks.length === 0 ? (
          <EmptyState
            icon={tab === "favorites" ? Heart : Music2}
            title={
              needle
                ? "No matches"
                : tab === "favorites"
                  ? "No favorites yet"
                  : "Nothing added yet"
            }
            description={
              needle
                ? `Nothing in ${TITLES[tab]} matches “${filter}”.`
                : tab === "favorites"
                  ? "Tap the heart on any song and it will appear here."
                  : `Your ${RECENT_LIMIT} newest songs appear here.`
            }
          />
        ) : layout === "grid" ? (
          <CardGrid>
            {visibleTracks.map((track, i) => (
              <ContextMenuArea
                key={track.id}
                entries={() =>
                  buildTrackMenu({
                    tracks: [track],
                    play: () => playFrom(visibleTracks, i, player.playTracks),
                  })
                }
              >
                <div className="group relative min-w-0">
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() =>
                      playFrom(visibleTracks, i, player.playTracks)
                    }
                    aria-label={`Play ${track.title}`}
                  >
                    <LibraryCover
                      hash={track.artwork}
                      seed={track.album}
                      large
                      className="w-full"
                    />
                    <span
                      title={track.title}
                      className="bidi mt-3 block truncate text-body font-semibold"
                    >
                      {track.title}
                    </span>
                    <span
                      className="bidi block truncate text-meta text-ink-3"
                    >
                      {track.artist}
                    </span>
                  </button>
                  <DropdownMenuButton
                    entries={() =>
                      buildTrackMenu({
                        tracks: [track],
                        play: () =>
                          playFrom(visibleTracks, i, player.playTracks),
                      })
                    }
                  >
                    <IconButton
                      icon={MoreHorizontal}
                      label={`Options for ${track.title}`}
                      size="sm"
                      className="absolute top-2 right-2 bg-obsidian/80"
                    />
                  </DropdownMenuButton>
                  {track.missing && (
                    <p className="mt-1 text-caption text-warning">
                      File unavailable
                    </p>
                  )}
                </div>
              </ContextMenuArea>
            ))}
          </CardGrid>
        ) : (
          <TrackTable
            label={TITLES[tab]}
            tracks={visibleTracks}
            sort={effectiveSort}
            onSort={toggle}
            onPlay={(i) => playFrom(visibleTracks, i, player.playTracks)}
          />
        )
      ) : tab === "albums" ? (
        visibleAlbums.length ? (
          layout === "list" ? (
            <div role="list" aria-label="Albums">
              {visibleAlbums.map((a) => (
                <div key={a.id} role="listitem">
                  <ContextMenuArea entries={() => albumMenu(a)}>
                    <button
                      type="button"
                      onClick={() => navigate({ name: "album", id: a.id })}
                      className="flex w-full items-center gap-4 rounded-sm border-b border-line px-3 py-3 text-left hover:bg-raised"
                    >
                      <LibraryCover
                        hash={a.artwork}
                        seed={a.title}
                        className="h-14 w-[73px]"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          title={a.title}
                          className="bidi block truncate text-body font-semibold"
                        >
                          {a.title}
                        </span>
                        <span
                          className="bidi block truncate text-meta text-ink-3"
                        >
                          {a.artist}
                        </span>
                      </span>
                      <span className="text-meta text-ink-3">
                        {plural(a.trackCount, "song")}
                      </span>
                    </button>
                  </ContextMenuArea>
                </div>
              ))}
            </div>
          ) : (
            <CardGrid>
              {visibleAlbums.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </CardGrid>
          )
        ) : (
          <EmptyState
            icon={Music2}
            title="No matches"
            description={`No albums match “${filter}”.`}
          />
        )
      ) : visibleArtists.length ? (
        <CardGrid min={156}>
          {visibleArtists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </CardGrid>
      ) : (
        <EmptyState
          icon={Music2}
          title="No matches"
          description={`No artists match “${filter}”.`}
        />
      )}
    </Page>
  );
}
