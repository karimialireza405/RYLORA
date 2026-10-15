import { setPreference, useUi } from "@/stores/ui";

export function pinnedAlbumIds(raw: string | undefined): number[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (id): id is number => Number.isSafeInteger(id) && id > 0,
            ),
          ),
        ].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export function toggleAlbumPin(id: number): void {
  const ids = pinnedAlbumIds(useUi.getState().prefs.pinnedAlbums);
  void setPreference(
    "pinnedAlbums",
    JSON.stringify(
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    ),
  );
}
