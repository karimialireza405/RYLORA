import {
  Check,
  ChevronRight,
  FileAudio,
  FolderPlus,
  LoaderCircle,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { player } from "@/stores/player";
import { backend } from "@/services/backend";
import { notifyError } from "@/stores/toasts";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { navigate } from "@/stores/navigation";
import { plural } from "@/utils/format";
import { SUPPORTED_FORMAT_LABEL } from "@/utils/formats";
import {
  addFilesInteractive,
  addFolderInteractive,
  type ImportOutcome,
} from "./actions";

export function AddMusicDialog() {
  const open = useUi((s) => s.addMusicOpen);
  const scanning = useLibrary((s) => s.scanning);
  const importing = useLibrary((s) => s.importing);
  const progress = useLibrary((s) => s.scanProgress);
  const summary = useLibrary((s) => s.lastScanSummary);
  const [folderStarted, setFolderStarted] = useState(false);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const busy = picking || importing;
  useEffect(() => {
    if (open) {
      setResult(null);
      setFolderStarted(false);
    }
  }, [open]);
  const choose = async (folder: boolean) => {
    setPicking(true);
    setResult(null);
    try {
      if (folder) {
        if (await addFolderInteractive()) {
          setFolderStarted(true);
        }
      } else setResult(await addFilesInteractive());
    } finally {
      setPicking(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(addMusicOpen) => useUi.setState({ addMusicOpen })}
      title="Add music"
      description="Choose songs or a folder from your computer."
      className="w-[min(520px,calc(100vw-48px))] p-8"
    >
      <div className="space-y-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose(false)}
          className="group flex w-full items-center gap-4 rounded-lg bg-raised p-5 text-left ring-1 ring-line-strong transition-colors hover:bg-lifted disabled:opacity-50"
        >
          <FileAudio
            className="size-6 shrink-0 text-blue-soft"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-lead font-semibold text-ink">
              Choose music files
            </span>
            <span className="mt-1 block text-meta text-ink-3">
              Add one song or select a whole collection.
            </span>
          </span>
          <ChevronRight className="size-4 text-ink-3" aria-hidden />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose(true)}
          className="group flex w-full items-center gap-4 rounded-lg p-5 text-left ring-1 ring-line-strong transition-colors hover:bg-raised disabled:opacity-50"
        >
          <FolderPlus
            className="size-6 shrink-0 text-ink-2"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-lead font-semibold text-ink">
              Choose a music folder
            </span>
            <span className="mt-1 block text-meta text-ink-3">
              Include subfolders and pick up changes on rescan.
            </span>
          </span>
          <ChevronRight className="size-4 text-ink-3" aria-hidden />
        </button>
      </div>
      {(busy || scanning) && (
        <div
          role="status"
          className="mt-5 flex items-center gap-3 text-meta text-ink-2"
        >
          <LoaderCircle
            className="size-4 animate-spin text-blue-soft"
            aria-hidden
          />
          <span>
            {importing
              ? "Reading your music and cover art…"
              : picking
                ? "Choose your music in the file picker…"
                : progress?.total
                  ? `Adding music · ${progress.processed} / ${progress.total}`
                  : "Looking for music in your folder…"}
          </span>
        </div>
      )}
      {scanning && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-label="Adding music"
            aria-valuemin={0}
            aria-valuemax={progress?.total || 100}
            aria-valuenow={progress?.total ? progress.processed : undefined}
            className="h-1.5 overflow-hidden rounded-full bg-lifted"
          >
            <div
              className="h-full bg-blue-soft"
              style={{
                width: progress?.total
                  ? `${Math.min(100, (progress.processed / progress.total) * 100)}%`
                  : "25%",
              }}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() =>
              void backend()
                .library.cancelScan()
                .catch((e) => notifyError("Couldn't stop scan", e))
            }
          >
            Stop scan
          </Button>
        </div>
      )}
      {folderStarted && !scanning && summary && (
        <div role="status" className="mt-5 rounded-lg bg-raised p-4 text-meta">
          <p className="font-semibold">
            {summary.cancelled ? "Scan stopped" : "Folder scan complete"}
          </p>
          <p className="mt-2 text-ink-3">
            {summary.addedOrUpdated} added or updated · {summary.unchanged}{" "}
            unchanged · {summary.failed.length} unreadable
          </p>
          {summary.failed.length > 0 && (
            <details className="mt-3">
              <summary>Unreadable files</summary>
              <ul className="mt-2 max-h-28 overflow-y-auto break-all">
                {summary.failed.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          )}
          <Button
            size="sm"
            className="mt-4"
            onClick={() => {
              useUi.setState({ addMusicOpen: false });
              navigate({ name: "library", tab: "recent" });
            }}
          >
            View songs
          </Button>
        </div>
      )}
      {result && (
        <div role="status" className="mt-5 rounded-lg bg-raised p-4">
          <div className="flex items-center gap-2 text-body text-ink">
            <Check className="size-4 text-blue-soft" aria-hidden />
            {plural(result.trackIds.length, "song")} ready in your library
          </div>
          {result.rejected.length > 0 && (
            <p className="mt-2 text-meta text-ink-3">
              {plural(result.rejected.length, "file")} could not be read.
            </p>
          )}
          <p className="mt-2 text-meta text-ink-3">
            {result.added} newly added · {result.existing} already in your
            library
          </p>
          {result.rejected.length > 0 && (
            <details className="mt-3 text-meta text-ink-3">
              <summary>Unreadable files</summary>
              <ul className="mt-2 max-h-28 overflow-y-auto break-all">
                {result.rejected.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={Play}
              disabled={!result.trackIds.length}
              onClick={() => {
                player.playTracks(result.trackIds);
                useUi.setState({ addMusicOpen: false });
                navigate({ name: "nowPlaying" });
              }}
            >
              Play now
            </Button>
            <Button
              size="sm"
              onClick={() => {
                useUi.setState({ addMusicOpen: false });
                navigate({ name: "library", tab: "recent" });
              }}
            >
              View songs
            </Button>
          </div>
        </div>
      )}
      <p className="mt-6 text-caption leading-5 text-ink-3">
        {SUPPORTED_FORMAT_LABEL}.<br />
        You can also drop files or folders anywhere in the app.
      </p>
    </Dialog>
  );
}
