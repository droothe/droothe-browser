import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RotateCw, Shield, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type ShieldsStatus = {
  enabled: boolean;
  siteEnabled: boolean;
  blockedCount: number;
  hostname: string;
};

type ShieldsStatusUpdate = {
  tabId: string;
  blockedCount: number;
};

type ShieldsPopoverProps = {
  activeId: string | null;
  url: string;
  onReload: () => void;
  onError: (message: string) => void;
};

export default function ShieldsPopover({
  activeId,
  url,
  onReload,
  onError,
}: ShieldsPopoverProps) {
  const [status, setStatus] = useState<ShieldsStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    setOpen(false);
    setStatus(null);

    if (!activeId || !/^https?:\/\//i.test(url)) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const stopListening = await listen<ShieldsStatusUpdate>(
        "shields-status-updated",
        (event) => {
          if (event.payload.tabId === activeId) {
            setStatus((current) =>
              current ? { ...current, blockedCount: event.payload.blockedCount } : current,
            );
          }
        },
      );
      if (cancelled) {
        stopListening();
        return;
      }
      unlisten = stopListening;

      const nextStatus = await invoke<ShieldsStatus>("get_shields_status", {
        tabId: activeId,
        url,
      });
      if (!cancelled) {
        setStatus((current) =>
          current
            ? { ...nextStatus, blockedCount: Math.max(current.blockedCount, nextStatus.blockedCount) }
            : nextStatus,
        );
      }
    })().catch((reason) => {
      if (!cancelled) onError(String(reason));
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [activeId, onError, url]);

  async function toggleSite() {
    if (!activeId || !status) return;
    try {
      const nextStatus = await invoke<ShieldsStatus>("toggle_site_shields", {
        tabId: activeId,
        url,
      });
      setStatus(nextStatus);
    } catch (reason) {
      onError(String(reason));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Droothe Shields"
        aria-expanded={open}
        aria-pressed={Boolean(status?.siteEnabled)}
        title="Droothe Shields"
        disabled={!status}
        onClick={() => setOpen((current) => !current)}
        className={`relative flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:opacity-50 ${
          status?.siteEnabled
            ? "text-[var(--accent-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        {status?.siteEnabled ? (
          <ShieldCheck size={14} />
        ) : (
          <Shield size={14} />
        )}
        {Boolean(status?.blockedCount) && (
          <span className="min-w-4 rounded-full bg-[var(--accent-primary)] px-1 text-center text-[9px] font-semibold leading-4 text-slate-950">
            {status?.blockedCount}
          </span>
        )}
      </button>

      {open && status && (
        <div className="shell-popover absolute right-0 top-[calc(100%+10px)] z-50 w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-[var(--text-primary)] shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-[var(--accent-secondary)]" />
              <div>
                <h2 className="text-sm font-semibold">Droothe Kalkanı</h2>
                <p className="mt-0.5 max-w-48 truncate text-xs text-[var(--text-secondary)]">
                  {status.hostname}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[var(--bg-omnibox)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">
              {status.blockedCount} engellendi
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={status.siteEnabled}
            onClick={() => void toggleSite()}
            className="flex w-full items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-omnibox)] px-3 py-2.5 text-left"
          >
            <span className="text-xs font-medium">
              Droothe Kalkanı: {status.siteEnabled ? "Aktif" : "Pasif"}
            </span>
            <span
              className={`relative h-5 w-9 rounded-full transition-colors ${
                status.siteEnabled ? "bg-[var(--accent-primary)]" : "bg-[var(--text-muted)]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  status.siteEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onReload();
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RotateCw size={13} />
            Sayfayı yeniden yükle
          </button>
          <p className="mt-2 text-center text-[10px] text-[var(--text-muted)]">
            Değişikliklerin tam uygulanması için sayfayı yenileyin.
          </p>
        </div>
      )}
    </div>
  );
}
