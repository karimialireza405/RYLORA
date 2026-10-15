import { create } from "zustand";

import type { AlbumId, ArtistId, PlaylistId } from "@/types/domain";

export type LibraryTab = "songs" | "albums" | "artists" | "favorites" | "recent";

export type Route =
  | { name: "home" }
  | { name: "search" }
  | { name: "library"; tab: LibraryTab }
  | { name: "album"; id: AlbumId }
  | { name: "artist"; id: ArtistId }
  | { name: "playlists" }
  | { name: "playlist"; id: PlaylistId }
  | { name: "nowPlaying" }
  | { name: "settings" };

interface NavState {
  stack: Route[];
  index: number;
}

const MAX_HISTORY = 100;

export const useNavigation = create<NavState>(() => ({ stack: [{ name: "home" }], index: 0 }));

export function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function currentRoute(): Route {
  const { stack, index } = useNavigation.getState();
  return stack[index]!;
}

export function navigate(route: Route, { replace = false } = {}): void {
  useNavigation.setState(({ stack, index }) => {
    if (sameRoute(stack[index]!, route)) return { stack, index };
    const base = replace ? stack.slice(0, index) : stack.slice(0, index + 1);
    const next = [...base, route].slice(-MAX_HISTORY);
    return { stack: next, index: next.length - 1 };
  });
}

export function goBack(): void {
  useNavigation.setState((s) => ({ index: Math.max(0, s.index - 1) }));
}

export function goForward(): void {
  useNavigation.setState((s) => ({ index: Math.min(s.stack.length - 1, s.index + 1) }));
}

export function useRoute(): Route {
  return useNavigation((s) => s.stack[s.index]!);
}
