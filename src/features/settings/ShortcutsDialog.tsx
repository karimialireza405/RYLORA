import { Dialog } from "@/components/ui/Dialog";
import { useUi } from "@/stores/ui";
import { useT } from "@/i18n";
import { shortcuts } from "./shortcuts";

export function ShortcutsTable({ columns = 2 }: { columns?: 1 | 2 }) {
  const t = useT();
  return (
    <div className={columns === 2 ? "grid grid-cols-2 gap-x-10 gap-y-7" : "space-y-7"}>
      {shortcuts(t).map((group) => (
        <section key={group.group}>
          <h3 className="mb-2 caps text-[10px] text-ink-4 uppercase">{group.group}</h3>
          <dl className="divide-y divide-line">
            {group.items.map(([keys, action]) => (
              <div key={keys} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-meta text-ink-2">{action}</dt>
                <dd className="shrink-0">
                  <kbd dir="ltr" className="rounded-xs bg-raised px-1.5 py-0.5 font-sans text-caption font-medium text-ink-2 ring-1 ring-line-strong">{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function ShortcutsDialog() {
  const t = useT();
  const open = useUi((s) => s.shortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => useUi.setState({ shortcutsOpen: o })} title={t.settings.shortcuts} className="w-[min(820px,calc(100vw-48px))]">
      <div className="max-h-[65vh] overflow-y-auto pe-2">
        <ShortcutsTable />
      </div>
    </Dialog>
  );
}
