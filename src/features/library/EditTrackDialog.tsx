import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LibraryCover } from "@/components/ui/LibraryCover";
import { Dialog, TextField } from "@/components/ui/Dialog";
import { backend } from "@/services/backend";
import { refreshLibrary, useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { toast, notifyError } from "@/stores/toasts";
import type { Track } from "@/types/domain";

export function EditTrackDialog() {
  const id = useUi((s) => s.editTrackId),
    track = useLibrary((s) => (id === null ? undefined : s.trackById.get(id)));
  return track ? <EditForm key={track.id} track={track} /> : null;
}
function EditForm({ track }: { track: Track }) {
  const [title, setTitle] = useState(track.title),
    [artist, setArtist] = useState(track.artist),
    [album, setAlbum] = useState(track.album),
    [albumArtist, setAlbumArtist] = useState(track.albumArtist);
  const [year, setYear] = useState(track.year?.toString() ?? ""),
    [genre, setGenre] = useState(track.genre ?? "");
  const [artworkPath, setArtworkPath] = useState<string | null>(null),
    [writeToFile, setWriteToFile] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const scanning = useLibrary((s) => s.scanning);
  const close = () => {
    if (!saving) useUi.setState({ editTrackId: null });
  };
  const submit = async () => {
    if (
      !title.trim() ||
      !artist.trim() ||
      !album.trim() ||
      !albumArtist.trim()
    ) {
      setError("Title, artist, album and album artist are required.");
      return;
    }
    if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1)) {
      setError("Enter a year between 1 and 9999.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await backend().library.editTrack(track.id, {
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        albumArtist: albumArtist.trim(),
        year: year ? Number(year) : null,
        genre: genre.trim() || null,
        artworkPath,
        writeToFile,
      });
      await refreshLibrary();
      useUi.setState({ editTrackId: null });
      toast({
        tone: "success",
        title: "Song information saved",
        description: writeToFile
          ? "Updated in your library and audio file."
          : "Saved in RYLORA. Your audio file is unchanged.",
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : JSON.stringify(e),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Edit song information"
      description="Update how this song appears in your collection."
      className="w-[min(620px,calc(100vw-48px))]"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={saving} className="space-y-4">
          <div className="flex items-center gap-4">
            <LibraryCover
              hash={track.artwork}
              seed={track.album}
              className="h-16 w-[84px]"
            />
            <div className="min-w-0">
              <Button
                size="sm"
                icon={ImagePlus}
                onClick={() =>
                  void backend()
                    .system.pickArtwork()
                    .then((path) => {
                      if (path) setArtworkPath(path);
                    })
                    .catch((e) => notifyError("Couldn't choose artwork", e))
                }
              >
                Change cover
              </Button>
              {artworkPath && (
                <p
                  className="bidi mt-2 truncate text-caption text-ink-3"
                  title={artworkPath}
                >
                  {artworkPath.split(/[\\/]/).at(-1)}
                </p>
              )}
            </div>
          </div>
          <TextField
            label="Title"
            value={title}
            onChange={setTitle}
            autoFocus
            maxLength={512}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Artist"
              value={artist}
              onChange={setArtist}
              maxLength={512}
            />
            <TextField
              label="Album artist"
              value={albumArtist}
              onChange={setAlbumArtist}
              maxLength={512}
            />
          </div>
          <TextField
            label="Album"
            value={album}
            onChange={setAlbum}
            maxLength={512}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Year"
              value={year}
              onChange={setYear}
              maxLength={4}
            />
            <TextField
              label="Genre"
              value={genre}
              onChange={setGenre}
              maxLength={512}
            />
          </div>
          <label className="flex items-start gap-3 rounded-md bg-raised p-3 text-meta">
            <input
              type="checkbox"
              checked={writeToFile}
              onChange={(e) => setWriteToFile(e.target.checked)}
              className="mt-1 accent-blue"
            />
            <span>
              <span className="block font-medium">
                Also write changes to the audio file
              </span>
              <span className="mt-1 block text-ink-3">
                Default: save only in RYLORA. Enable this to update the file's
                tags and selected cover.
              </span>
            </span>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-meta text-danger">
            {error}
          </p>
        )}
        {scanning && (
          <p className="mt-3 text-meta text-ink-3">
            Wait for the library scan to finish before saving.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={saving} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || scanning}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
