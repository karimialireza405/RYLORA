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
import { messages } from "@/i18n";

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
  const t = messages();
  return {
    type: "sub",
    label: t.trackMenu.addToPlaylist,
    icon: ListPlus,
    children: [
      {
        type: "item",
        label: t.trackMenu.newPlaylist,
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
  const t = messages();

  if (tracks.length > 1)
    entries.push({
      type: "label",
      label: t.trackMenu.selected(tracks.length),
    });
  entries.push(
    { type: "item", label: t.menu.play, icon: Play, onSelect: play },
    {
      type: "item",
      label: t.menu.playNext,
      icon: ListEnd,
      onSelect: () => player.playNext(ids),
    },
    {
      type: "item",
      label: t.menu.addToQueue,
      icon: ListMusic,
      onSelect: () => player.enqueue(ids),
    },
    { type: "separator" },
    playlistSubmenu(ids),
    {
      type: "item",
      label: allFavorite ? t.common.removeFromFavorites : t.common.addToFavorites,
      icon: allFavorite ? HeartOff : Heart,
      onSelect: () => void setFavorite(ids, !allFavorite),
    },
  );
  if (single && (!hideGoToAlbum || !hideGoToArtist)) {
    entries.push({ type: "separator" });
    if (!hideGoToAlbum)
      entries.push({
        type: "item",
        label: t.trackMenu.goToAlbum,
        icon: Disc3,
        onSelect: () => navigate({ name: "album", id: single.albumId }),
      });
    if (!hideGoToArtist)
      entries.push({
        type: "item",
        label: t.menu.goToArtist,
        icon: Mic2,
        onSelect: () => navigate({ name: "artist", id: single.artistId }),
      });
  }
  if (onRemoveFromPlaylist) {
    entries.push(
      { type: "separator" },
      {
        type: "item",
        label: t.trackMenu.removeFromPlaylist,
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
        label: t.trackMenu.editInfo,
        icon: Pencil,
        onSelect: () => useUi.setState({ editTrackId: single.id }),
      },
    );
  return entries;
}
