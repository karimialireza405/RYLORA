import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, TextField } from "@/components/ui/Dialog";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { useUi } from "@/stores/ui";
import { plural } from "@/utils/format";
import { createPlaylist, renamePlaylist } from "./actions";

const MAX_NAME = 120;

function suggestName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = `My Playlist #${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function NewPlaylistDialog() {
  const { open, trackIds } = useUi((s) => s.newPlaylist);
  const playlists = useLibrary((s) => s.playlists);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(suggestName(playlists.map((p) => p.name)));
  }, [open]);

  const close = () => useUi.setState({ newPlaylist: { open: false, trackIds: [] } });
  const error = name.trim() ? null : "Give your playlist a name.";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error || busy) return;
    setBusy(true);
    const id = await createPlaylist(name, trackIds);
    setBusy(false);
    if (id !== null) {
      close();
      if (!trackIds.length) navigate({ name: "playlist", id });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="New playlist"
      description={trackIds.length ? `${plural(trackIds.length, "song")} will be added.` : undefined}
    >
      <form onSubmit={submit}>
        <TextField label="Name" value={name} onChange={setName} autoFocus maxLength={MAX_NAME} error={error} />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!!error || busy}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RenamePlaylistDialog({ id, current, open, onClose }: { id: number; current: string; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(current);
  useEffect(() => {
    if (open) setName(current);
  }, [open, current]);
  const error = name.trim() ? null : "Name can't be empty.";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Rename playlist">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (error) return;
          if (name.trim() === current || (await renamePlaylist(id, name))) onClose();
        }}
      >
        <TextField label="Name" value={name} onChange={setName} autoFocus maxLength={MAX_NAME} error={error} />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!!error}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
