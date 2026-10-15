import { ListMusic, Plus } from "lucide-react";

import { Page, PageHeader } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { CardGrid, PlaylistCard } from "@/features/library/Cards";
import { useLibrary } from "@/stores/library";
import { openNewPlaylist } from "@/stores/ui";
import { useT } from "@/i18n";

export function PlaylistsPage() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  return (
    <Page>
      <PageHeader
        title={t.playlists.title}
        subtitle={playlists.length ? t.count.playlists(playlists.length) : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openNewPlaylist()}>
            {t.playlists.newPlaylist}
          </Button>
        }
      />
      {playlists.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title={t.playlists.emptyTitle}
          description={t.playlists.emptyHint}
        >
          <Button variant="primary" icon={Plus} onClick={() => openNewPlaylist()}>
            {t.playlists.newPlaylist}
          </Button>
        </EmptyState>
      ) : (
        <CardGrid>
          <button
            type="button"
            onClick={() => openNewPlaylist()}
            className="group flex aspect-[1.3/1] w-full flex-col items-center justify-center gap-3 rounded-md bg-deep text-ink-3 ring-1 ring-line ring-inset transition-colors hover:bg-raised hover:text-ink"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-raised transition-colors group-hover:bg-lifted">
              <Plus className="size-6" aria-hidden />
            </span>
            <span className="text-body font-semibold">{t.playlists.newPlaylist}</span>
          </button>
          {playlists.map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </CardGrid>
      )}
    </Page>
  );
}
