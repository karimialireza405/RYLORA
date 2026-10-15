import {
  Disc3,
  Heart,
  HeartOff,
  ListEnd,
  ListMusic,
  ListPlus,
  Mic2,
  Play,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";

import type { MenuEntry } from "@/components/ui/Menu";
import { addToPlaylist } from "@/features/playlists/actions";
import { setFavorite, useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { player } from "@/stores/player";
import { openNewPlaylist, useUi } from "@/stores/ui";
import type { Track } from "@/types/domain";
import { plural } from "@/utils/format";

export interface TrackMenuOptions {
  /** Tracks the menu acts on (the selection, or the single clicked track). */
  tracks: Track[];
  /** Play these tracks starting at `index` — usually the surrounding list. */
  play: () => void;
  onRemoveFromPlaylist?: () => void;
  hideGoToAlbum?: boolean;
  hideGoToArtist?: boolean;
}

export function playlistSubmenu(trackIds: number[]): MenuEntry {
  const playlists = useLibrary.getState().playlists;
  return {
    type: "sub",
    label: "Add to playlist",
    icon: ListPlus,
    children: [
      {
        type: "item",
        label: "New playlist…",
        icon: Plus,
        onSelect: () => openNewPlaylist(trackIds),
      },
      ...(playlists.length ? [{ type: "separator" } as const] : []),
      ...playlists.map(
        (p): MenuEntry => ({
          type: "item",
          label: p.name,
          icon: ListMusic,
          onSelect: () => void addToPlaylist(p, trackIds),
        }),
      ),
    ],
  };
}

export function buildTrackMenu({
  tracks,
  play,
  onRemoveFromPlaylist,
  hideGoToAlbum,
  hideGoToArtist,
}: TrackMenuOptions): MenuEntry[] {
  const ids = tracks.map((t) => t.id);
  const single = tracks.length === 1 ? tracks[0] : undefined;
  const allFavorite = tracks.every((t) => t.favorite);
  const entries: MenuEntry[] = [];

  if (tracks.length > 1)
    entries.push({
      type: "label",
      label: plural(tracks.length, "song") + " selected",
    });
  entries.push(
    { type: "item", label: "Play", icon: Play, onSelect: play },
    {
      type: "item",
      label: "Play next",
      icon: ListEnd,
      onSelect: () => player.playNext(ids),
    },
    {
      type: "item",
      label: "Add to queue",
      icon: ListMusic,
      onSelect: () => player.enqueue(ids),
    },
    { type: "separator" },
    playlistSubmenu(ids),
    {
      type: "item",
      label: allFavorite ? "Remove from favorites" : "Add to favorites",
      icon: allFavorite ? HeartOff : Heart,
      onSelect: () => void setFavorite(ids, !allFavorite),
    },
  );
  if (single && (!hideGoToAlbum || !hideGoToArtist)) {
    entries.push({ type: "separator" });
    if (!hideGoToAlbum)
      entries.push({
        type: "item",
        label: "Go to album",
        icon: Disc3,
        onSelect: () => navigate({ name: "album", id: single.albumId }),
      });
    if (!hideGoToArtist)
      entries.push({
        type: "item",
        label: "Go to artist",
        icon: Mic2,
        onSelect: () => navigate({ name: "artist", id: single.artistId }),
      });
  }
  if (onRemoveFromPlaylist) {
    entries.push(
      { type: "separator" },
      {
        type: "item",
        label: "Remove from playlist",
        icon: Trash2,
        danger: true,
        onSelect: onRemoveFromPlaylist,
      },
    );
  }
  if (single)
    entries.push(
      { type: "separator" },
      {
        type: "item",
        label: "Edit song information",
        icon: Pencil,
        onSelect: () => useUi.setState({ editTrackId: single.id }),
      },
    );
  return entries;
}
