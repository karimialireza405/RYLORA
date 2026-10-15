export type ArtworkSize = "sm" | "lg";

type Resolver = (hash: string, size: ArtworkSize) => string;

const isWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** Cached covers are served by the backend's narrow `artwork://` protocol. */
let resolver: Resolver = (hash, size) =>
  isWindows ? `http://artwork.localhost/${hash}/${size}` : `artwork://localhost/${hash}/${size}`;

export function setArtworkResolver(next: Resolver): void {
  resolver = next;
}

export function artworkUrl(hash: string | null | undefined, size: ArtworkSize): string | null {
  return hash ? resolver(hash, size) : null;
}
