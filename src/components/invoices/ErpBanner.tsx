import { useEffect, useRef, useState } from "react";
import MaterialIcon from "../landing/MaterialIcon";

type ErpBannerProps = {
  onNotify: (message: string) => void;
};

function ErpBanner({ onNotify }: ErpBannerProps) {
  const [syncing, setSyncing] = useState(false);
  const syncTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (syncTimer.current !== null) {
        window.clearTimeout(syncTimer.current);
      }
    },
    [],
  );

  const previewSync = () => {
    if (syncing) return;
    setSyncing(true);
    syncTimer.current = window.setTimeout(() => {
      setSyncing(false);
      syncTimer.current = null;
      onNotify("Preview only: no ERP integration is connected.");
    }, 900);
  };

  return (
    <section
      aria-label="ERP integration status"
      className="flex w-full items-center justify-between gap-space-sm rounded-xl bg-surface-container-low p-space-md shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-space-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest text-primary">
          <MaterialIcon name="sync_alt" className="text-[20px]" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-x-space-xs gap-y-1">
            <span className="truncate font-headline-sm text-headline-sm text-on-surface">
              NetSuite &amp; Stripe
            </span>
            <span className="rounded-full bg-primary-fixed px-space-xs py-0.5 font-label-sm text-label-sm font-bold text-on-primary-fixed-variant">
              SIMULATED
            </span>
          </div>
          <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
            Sample connection · integrations not connected
          </span>
        </div>
      </div>
      <button
        aria-label="Preview ERP sync"
        className="flex shrink-0 items-center gap-1 rounded-lg bg-surface-container-highest px-space-sm py-space-xs font-label-sm text-label-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
        onClick={previewSync}
        type="button"
      >
        <MaterialIcon
          name="refresh"
          className={`text-[15px] ${syncing ? "animate-spin" : ""}`}
        />
        <span>{syncing ? "Previewing" : "Sync"}</span>
      </button>
    </section>
  );
}

export default ErpBanner;
