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
import { useT } from "@/i18n";

export function EditTrackDialog() {
  const id = useUi((s) => s.editTrackId),
    track = useLibrary((s) => (id === null ? undefined : s.trackById.get(id)));
  return track ? <EditForm key={track.id} track={track} /> : null;
}
function EditForm({ track }: { track: Track }) {
  const t = useT();
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
      setError(t.editTrack.required);
      return;
    }
    if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1)) {
      setError(t.editTrack.invalidYear);
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
        title: t.editTrack.saved,
        description: writeToFile
          ? t.editTrack.savedToFile
          : t.editTrack.savedInLibrary,
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
      title={t.editTrack.title}
      description={t.editTrack.description}
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
                    .catch((e) => notifyError(t.editTrack.chooseArtworkFailed, e))
                }
              >
                {t.editTrack.changeCover}
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
            label={t.editTrack.fieldTitle}
            value={title}
            onChange={setTitle}
            autoFocus
            maxLength={512}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label={t.editTrack.fieldArtist}
              value={artist}
              onChange={setArtist}
              maxLength={512}
            />
            <TextField
              label={t.editTrack.fieldAlbumArtist}
              value={albumArtist}
              onChange={setAlbumArtist}
              maxLength={512}
            />
          </div>
          <TextField
            label={t.editTrack.fieldAlbum}
            value={album}
            onChange={setAlbum}
            maxLength={512}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label={t.editTrack.fieldYear}
              value={year}
              onChange={setYear}
              maxLength={4}
            />
            <TextField
              label={t.editTrack.fieldGenre}
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
                {t.editTrack.writeToFile}
              </span>
              <span className="mt-1 block text-ink-3">
                {t.editTrack.writeToFileHint}
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
            {t.editTrack.waitForScan}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={saving} onClick={close}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || scanning}>
            {saving ? t.editTrack.saving : t.editTrack.saveChanges}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
