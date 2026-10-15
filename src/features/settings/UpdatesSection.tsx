import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { useT } from "@/i18n";
import { setPreference, useUi } from "@/stores/ui";
import { checkForUpdates, installUpdate, loadUpdateStatus, useUpdates } from "@/stores/updates";
import { formatNumber } from "@/utils/format";

export function UpdatesSection() {
  const t = useT();
  const { status, phase, update, progress, error } = useUpdates();
  const auto = useUi((s) => s.prefs.checkUpdates === "true");

  useEffect(() => {
    void loadUpdateStatus();
  }, []);

  if (status && !status.configured) {
    return <p className="py-3 text-meta text-ink-3">{t.settings.updatesUnavailable}</p>;
  }

  const pct = progress?.total ? `${formatNumber(Math.round((progress.downloaded / progress.total) * 100))}%` : "";
  return (
    <div>
      <Switch
        label={t.settings.checkUpdatesAuto}
        description={t.settings.checkUpdatesAutoHint}
        checked={auto}
        onChange={(v) => void setPreference("checkUpdates", v ? "true" : "false")}
      />
      <div className="flex flex-wrap items-center gap-3 py-3" role="status">
        {phase === "available" || phase === "installing" ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-ink">{update && t.settings.updateAvailable(update.version)}</p>
              {update?.notes && <p className="bidi mt-1 text-meta whitespace-pre-line text-ink-3">{update.notes}</p>}
              {phase === "installing" && (
                <p className="mt-1 text-meta text-ink-3">
                  {progress?.total && progress.downloaded >= progress.total ? t.settings.installing : t.settings.downloading(pct)}
                </p>
              )}
            </div>
            <Button icon={Download} onClick={() => void installUpdate()} disabled={phase === "installing"}>
              {t.settings.installUpdate}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void checkForUpdates()} disabled={phase === "checking" || !status}>
              {phase === "checking" ? t.settings.checking : t.settings.checkNow}
            </Button>
            {phase === "upToDate" && status && <span className="text-meta text-ink-3">{t.settings.upToDate(status.currentVersion)}</span>}
            {phase === "error" && error && <span className="text-meta text-ink-3">{error}</span>}
          </>
        )}
      </div>
      <p className="flex items-center gap-2 text-caption text-ink-4">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {t.settings.updateVerified}
      </p>
    </div>
  );
}
