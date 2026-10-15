import { describe, expect, it } from "vitest";

import type { Album, Artist, Track } from "@/types/domain";
import { dailyPick, normalize, searchLibrary, sortTracks } from "./tracks";

let nextId = 1;
function track(partial: Partial<Track>): Track {
  return {
    id: nextId++,
    path: "",
    title: "Untitled",
    artist: "Artist",
    artistId: 1,
    album: "Album",
    albumId: 1,
    albumArtist: "Artist",
    trackNumber: null,
    discNumber: null,
    year: null,
    genre: null,
    durationMs: 1000,
    format: "flac",
    artwork: null,
    accent: null,
    favorite: false,
    missing: false,
    addedAt: 0,
    ...partial,
  };
}

describe("sortTracks", () => {
  const a = track({ title: "Beta", album: "Night Tide", trackNumber: 2, addedAt: 3 });
  const b = track({ title: "alpha", album: "Night Tide", trackNumber: 10, addedAt: 1 });
  const c = track({ title: "Gamma", album: "Night Tide", trackNumber: 1, addedAt: 2 });

  it("sorts case-insensitively by title", () => {
    expect(sortTracks([a, b, c], "title").map((t) => t.title)).toEqual(["alpha", "Beta", "Gamma"]);
  });
  it("uses numeric track order as the default tiebreak", () => {
    expect(sortTracks([a, b, c], "default").map((t) => t.trackNumber)).toEqual([1, 2, 10]);
  });
  it("supports descending order", () => {
    expect(sortTracks([a, b, c], "addedAt", "desc").map((t) => t.addedAt)).toEqual([3, 2, 1]);
  });
  it("does not mutate the input", () => {
    const input = [a, b, c];
    sortTracks(input, "title");
    expect(input).toEqual([a, b, c]);
  });
  it("ranks actual play counts, treating unplayed songs as zero", () => {
    expect(sortTracks([a,b,c],"playCount","desc",{[b.id]:5,[a.id]:1}).map(t=>t.id)).toEqual([b.id,a.id,c.id]);
  });
});

describe("searchLibrary", () => {
  const tracks = [
    track({ title: "Night Tide", artist: "Aurel Vane", album: "Night Tide" }),
    track({ title: "Undertow", artist: "Aurel Vane", album: "Night Tide" }),
    track({ title: "Vespers", artist: "Mira Solenne", album: "Glass Cathedral" }),
    track({ title: "Café Noir", artist: "Mira Solenne", album: "Glass Cathedral" }),
    track({ title: "Ghost", artist: "Nobody", missing: true }),
  ];
  const albums = [{ id: 1, title: "Night Tide", artist: "Aurel Vane" }] as Album[];
  const artists = [{ id: 1, name: "Aurel Vane" }, { id: 2, name: "Mira Solenne" }] as Artist[];
  const data = { tracks, albums, artists, playlists: [] };

  it("ranks prefix matches and requires all terms", () => {
    const r = searchLibrary("aurel under", data);
    expect(r.tracks.map((t) => t.title)).toEqual(["Undertow"]);
  });
  it("is accent-insensitive", () => {
    expect(searchLibrary("cafe", data).tracks[0]?.title).toBe("Café Noir");
  });
  it("excludes missing tracks", () => {
    expect(searchLibrary("ghost", data).tracks).toHaveLength(0);
  });
  it("prefers an exact artist as top result", () => {
    expect(searchLibrary("mira solenne", data).top?.kind).toBe("artist");
  });
  it("returns nothing for blank queries", () => {
    expect(searchLibrary("   ", data).top).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizes diacritics and case", () => {
    expect(normalize("  Ólafur ")).toBe("olafur");
  });
  it("dailyPick is stable for a date and returns a subset", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const day = new Date(2026, 9, 14);
    expect(dailyPick(items, 5, day)).toEqual(dailyPick(items, 5, day));
    expect(new Set(dailyPick(items, 20, day)).size).toBe(20);
  });
});
