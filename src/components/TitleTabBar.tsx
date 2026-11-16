import { getCurrentWindow } from "@tauri-apps/api/window";
import { Globe, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

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

  async function toggleMaximize() {
    try {
      await currentWindow.toggleMaximize();
      setMaximized(await currentWindow.isMaximized());
    } catch (reason) {
      onError(String(reason));
    }
  }

  async function minimize() {
    try {
      await currentWindow.minimize();
    } catch (reason) {
      onError(String(reason));
    }
  }

  async function closeWindow() {
    try {
      await currentWindow.close();
    } catch (reason) {
      onError(String(reason));
    }
  }

  return (
    <div className="flex h-10 min-h-10 items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-shell)] px-2">
      <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
        <div className="flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const active = activeId === tab.id;
            return (
              <div
                key={tab.id}
                data-active={active}
                className={`tab-item group relative flex h-8 min-w-[120px] max-w-[220px] flex-1 cursor-pointer items-center gap-2 rounded-t-lg px-3 text-xs transition-colors duration-150 ${
                  active
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-t-lg before:bg-[var(--accent-primary)]"
                    : "bg-[var(--bg-shell)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`}
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
                    onClose(tab.id);
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
          <div data-tauri-drag-region className="h-full min-w-4 flex-1" />
        </div>
      </div>

      <div data-tauri-drag-region className="h-full w-2 shrink-0" />

      <div className="flex h-full shrink-0 items-center">
        <button
          type="button"
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => void minimize()}
          className="flex h-8 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => void toggleMaximize()}
          className="flex h-8 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          aria-label="Close window"
          title="Close"
          onClick={() => void closeWindow()}
          className="flex h-8 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-rose-500 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
