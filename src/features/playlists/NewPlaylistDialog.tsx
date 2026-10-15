import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, TextField } from "@/components/ui/Dialog";
import { useLibrary } from "@/stores/library";
import { navigate } from "@/stores/navigation";
import { useUi } from "@/stores/ui";
import { messages, useT } from "@/i18n";
import { createPlaylist, renamePlaylist } from "./actions";

const MAX_NAME = 120;

function suggestName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = messages().playlists.suggestedName(i);
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function NewPlaylistDialog() {
  const t = useT();
  const { open, trackIds } = useUi((s) => s.newPlaylist);
  const playlists = useLibrary((s) => s.playlists);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(suggestName(playlists.map((p) => p.name)));
  }, [open]);

  const close = () => useUi.setState({ newPlaylist: { open: false, trackIds: [] } });
  const error = name.trim() ? null : t.playlists.nameRequired;

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
      title={t.playlists.newPlaylist}
      description={trackIds.length ? t.playlists.willBeAdded(trackIds.length) : undefined}
    >
      <form onSubmit={submit}>
        <TextField label={t.playlists.name} value={name} onChange={setName} autoFocus maxLength={MAX_NAME} error={error} />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={close}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={!!error || busy}>
            {t.common.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RenamePlaylistDialog({ id, current, open, onClose }: { id: number; current: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(current);
  useEffect(() => {
    if (open) setName(current);
  }, [open, current]);
  const error = name.trim() ? null : t.playlists.nameEmpty;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t.playlists.rename}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (error) return;
          if (name.trim() === current || (await renamePlaylist(id, name))) onClose();
        }}
      >
        <TextField label={t.playlists.name} value={name} onChange={setName} autoFocus maxLength={MAX_NAME} error={error} />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={!!error}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
