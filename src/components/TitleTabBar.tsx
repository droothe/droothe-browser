import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Globe, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import DrootheLogo from "./DrootheLogo";

const currentWindow = getCurrentWindow();

export type BrowserTab = {
  id: string;
  title: string;
  url: string;
};

type TitleTabBarProps = {
  tabs: BrowserTab[];
  activeId: string | null;
  onActivate: (tab: BrowserTab) => void;
  onClose: (tabId: string) => void;
  onCreate: () => void;
  onError: (message: string) => void;
};

function TabFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let faviconUrl = "";

  try {
    faviconUrl = `${new URL(url).origin}/favicon.ico`;
  } catch {
    faviconUrl = "";
  }

  if (failed || !faviconUrl) {
    return <Globe size={16} className="shrink-0 text-[var(--text-muted)]" />;
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

export default function TitleTabBar({
  tabs,
  activeId,
  onActivate,
  onClose,
  onCreate,
  onError,
}: TitleTabBarProps) {
  const [maximized, setMaximized] = useState(false);
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(() => new Set());
  const closeTimers = useRef(new Map<string, number>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void currentWindow
      .isMaximized()
      .then(setMaximized)
      .catch((reason) => onError(String(reason)));
    void currentWindow.onResized(() => {
      void currentWindow
        .isMaximized()
        .then(setMaximized)
        .catch((reason) => onError(String(reason)));
    }).then((stopListening) => {
      if (cancelled) {
        stopListening();
      } else {
        unlisten = stopListening;
      }
    }).catch((reason) => onError(String(reason)));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [currentWindow, onError]);

  useEffect(
    () => () => {
      closeTimers.current.forEach((timer) => window.clearTimeout(timer));
      closeTimers.current.clear();
    },
    [],
  );

  function closeTab(tabId: string) {
    if (closeTimers.current.has(tabId)) return;
    setClosingTabIds((current) => new Set(current).add(tabId));
    const timer = window.setTimeout(() => {
      closeTimers.current.delete(tabId);
      setClosingTabIds((current) => {
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
      if (tabsRef.current.some((tab) => tab.id === tabId)) onClose(tabId);
    }, 140);
    closeTimers.current.set(tabId, timer);
  }

  async function toggleMaximize() {
    try {
      await invoke("win_toggle_maximize");
      setMaximized(await currentWindow.isMaximized());
    } catch (reason) {
      console.error("Could not toggle window maximize state.", reason);
      onError(String(reason));
    }
  }

  async function minimize() {
    try {
      await invoke("win_minimize");
    } catch (reason) {
      console.error("Could not minimize the window.", reason);
      onError(String(reason));
    }
  }

  async function closeWindow() {
    try {
      await invoke("win_close");
    } catch (reason) {
      console.error("Could not close the window.", reason);
      onError(String(reason));
    }
  }

  return (
    <div className="flex h-10 min-h-10 items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-shell)] px-2">
      <span className="shrink-0" title="Droothe Browser">
        <DrootheLogo size={24} className="rounded-md" />
      </span>
      <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
        <div className="flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const active = activeId === tab.id;
            return (
              <div
                key={tab.id}
                data-active={active}
                className={`tab-item group relative flex h-8 min-w-[120px] max-w-[220px] flex-1 cursor-pointer items-center gap-2 rounded-t-lg px-3 text-xs ${
                  active
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-t-lg before:bg-[var(--accent-primary)]"
                    : "bg-[var(--bg-shell)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                } ${closingTabIds.has(tab.id) ? "tab-item--closing" : ""}`}
                onClick={() => onActivate(tab)}
                title={tab.url}
              >
                <TabFavicon key={tab.url} url={tab.url} />
                <span className="min-w-0 flex-1 truncate font-medium">{tab.title}</span>
                <button
                  type="button"
                  aria-label="Close tab"
                  className={`tab-close ml-auto h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
                    active ? "flex" : "hidden group-hover:flex"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            aria-label="New tab"
            title="New tab"
            onClick={onCreate}
            className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Plus size={16} />
          </button>
          <div data-tauri-drag-region className="h-full min-w-4 flex-1" aria-hidden="true" />
        </div>
      </div>

      <div className="flex h-full shrink-0 items-center">
        <button
          type="button"
          aria-label="Minimize window"
          title="Minimize"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void minimize()}
          className="relative z-50 pointer-events-auto flex h-8 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void toggleMaximize()}
          className="relative z-50 pointer-events-auto flex h-8 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          aria-label="Close window"
          title="Close"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void closeWindow()}
          className="relative z-50 pointer-events-auto flex h-8 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-red-500/90 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
