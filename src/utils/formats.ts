/** Mirrors `SUPPORTED_EXTENSIONS` in src-tauri/src/library/mod.rs. */
export const SUPPORTED_EXTENSIONS = ["mp3", "flac", "wav", "ogg", "oga", "m4a"] as const;

export const SUPPORTED_FORMAT_LABEL = "MP3, FLAC, WAV, OGG Vorbis and AAC (.m4a)";

export function isSupportedAudioPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}
