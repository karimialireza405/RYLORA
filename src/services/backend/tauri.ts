import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open } from "@tauri-apps/plugin-dialog";

import type { Backend } from "./types";
import { SUPPORTED_EXTENSIONS } from "@/utils/formats";

/** Production backend: typed wrappers around Tauri commands and events. */
export function createTauriBackend(): Backend {
  const win = getCurrentWindow();

  return {
    kind: "tauri",
    on: (event, handler) => listen(event, (e) => handler(e.payload as never)),

    player: {
      state: () => invoke("player_state"),
      playTracks: (trackIds, start) => invoke("player_play_tracks", { trackIds, start }),
      toggle: () => invoke("player_toggle"),
      play: () => invoke("player_play"),
      pause: () => invoke("player_pause"),
      next: () => invoke("player_next"),
      previous: () => invoke("player_previous"),
      seek: (positionMs) => invoke("player_seek", { positionMs: Math.max(0, Math.round(positionMs)) }),
      setVolume: (volume) => invoke("player_set_volume", { volume }),
      setMuted: (muted) => invoke("player_set_muted", { muted }),
      setShuffle: (shuffle) => invoke("player_set_shuffle", { shuffle }),
      setRepeat: (repeat) => invoke("player_set_repeat", { repeat }),
      playNext: (trackIds) => invoke("player_play_next", { trackIds }),
      enqueue: (trackIds) => invoke("player_enqueue", { trackIds }),
      removeFromQueue: (uid) => invoke("player_remove_from_queue", { uid }),
      moveInQueue: (uid, to) => invoke("player_move_in_queue", { uid, to }),
      jumpTo: (uid) => invoke("player_jump_to", { uid }),
      clearQueue: () => invoke("player_clear_queue"),
      setVisualizer: (enabled) => invoke("player_set_visualizer", { enabled }),
      lyrics: (trackId) => invoke("track_lyrics", { trackId }),
    },

    library: {
      snapshot: () => invoke("library_snapshot"),
      folders: () => invoke("library_folders"),
      addFolder: (path) => invoke("library_add_folder", { path }),
      removeFolder: (id) => invoke("library_remove_folder", { id }),
      rescan: () => invoke("library_rescan"),
      cancelScan: () => invoke("library_cancel_scan"),
      importFiles: (paths) => invoke("library_import_files", { paths }),
      editTrack: (trackId, request) => invoke("library_edit_track", { trackId, request }),
      setFavorite: (trackIds, favorite) => invoke("library_set_favorite", { trackIds, favorite }),
      recentPlays: (limit) => invoke("library_recent_plays", { limit }),
    },

    playlists: {
      list: () => invoke("playlists_list"),
      create: (name, trackIds) => invoke("playlist_create", { name, trackIds }),
      rename: (id, name) => invoke("playlist_rename", { id, name }),
      remove: (id) => invoke("playlist_delete", { id }),
      entries: (id) => invoke("playlist_entries", { id }),
      add: (id, trackIds) => invoke("playlist_add", { id, trackIds }),
      removeEntries: (id, entryIds) => invoke("playlist_remove", { id, entryIds }),
      move: (id, entryId, to) => invoke("playlist_move", { id, entryId, to }),
    },

    settings: {
      get: () => invoke("settings_get"),
      set: (key, value) => invoke("settings_set", { key, value }),
    },

    system: {
      pickFolder: async () => {
        const result = await open({ directory: true, multiple: false, title: "Add a music folder" });
        return typeof result === "string" ? result : null;
      },
      pickAudioFiles: async () => {
        const result = await open({
          multiple: true,
          title: "Open music files",
          filters: [{ name: "Audio", extensions: [...SUPPORTED_EXTENSIONS] }],
        });
        return Array.isArray(result) ? result : result ? [result] : [];
      },
      confirm: (message, title, okLabel) => ask(message, { title, kind: "warning", okLabel, cancelLabel: "Cancel" }),
      pickArtwork: async () => {
        const result = await open({multiple:false,title:"Choose cover artwork",filters:[{name:"Images",extensions:["jpg","jpeg","png","webp","bmp","gif"]}]});
        return typeof result === "string" ? result : null;
      },
      window: {
        minimize: () => win.minimize(),
        toggleMaximize: () => win.toggleMaximize(),
        isMaximized: () => win.isMaximized(),
        close: () => win.close(),
        setFullscreen: (on) => win.setFullscreen(on),
        isFullscreen: () => win.isFullscreen(),
        onResized: (handler) => win.onResized(() => handler()),
        onFileDrop: (handler) =>
          getCurrentWebview().onDragDropEvent((event) => {
            const p = event.payload;
            if (p.type === "enter") handler(p.paths, "enter");
            else if (p.type === "drop") handler(p.paths, "drop");
            else if (p.type === "leave") handler([], "leave");
          }),
      },
    },
  };
}
