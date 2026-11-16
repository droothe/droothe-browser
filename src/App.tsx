import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import NewTabView from "./components/NewTabView";
import NavigationBar from "./components/NavigationBar";
import ScratchpadDrawer from "./components/ScratchpadDrawer";
import TitleTabBar, { BrowserTab } from "./components/TitleTabBar";
import {
  fallbackTabTitle,
  isNewTabUrl,
  NEW_TAB_TITLE,
  NEW_TAB_URL,
  resolveAddress,
} from "./utils/address";

type TabTitleUpdate = { tabId: string; title: string };
type BrowserShortcut = { tabId: string; shortcut: string };
const SCRATCHPAD_WIDTH = 360;
const GEMINI_PANEL_WIDTH = 360;
type ShortcutActions = {
  tabs: BrowserTab[];
  activeId: string | null;
  createTab: () => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  restoreLastTab: () => Promise<void>;
  runHistoryAction: (action: "goBack" | "goForward" | "reload" | "stop") => Promise<void>;
};

function App() {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loadingByTab, setLoadingByTab] = useState<Record<string, boolean>>({});
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isScratchpadMounted, setIsScratchpadMounted] = useState(false);
  const [isGeminiOpen, setIsGeminiOpen] = useState(false);
  const nextId = useRef(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const closedTabs = useRef<BrowserTab[]>([]);
  const shortcutActionsRef = useRef<ShortcutActions | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const activeIsNewTab = Boolean(activeTab && isNewTabUrl(activeTab.url));
  const activeLoading = activeId ? Boolean(loadingByTab[activeId]) : false;

  const handleError = useCallback((message: string) => setError(message), []);

  useEffect(() => {
    if (isScratchpadOpen) {
      setIsScratchpadMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setIsScratchpadMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [isScratchpadOpen]);

  async function activateTab(tab: BrowserTab) {
    setError("");
    setActiveId(tab.id);
    setAddress(isNewTabUrl(tab.url) ? "" : tab.url);
    await invoke("open_tab", { tabId: tab.id, url: tab.url });
  }

  async function createTab() {
    const tab: BrowserTab = {
      id: String(nextId.current++),
      title: NEW_TAB_TITLE,
      url: NEW_TAB_URL,
    };
    setTabs((current) => [...current, tab]);
    try {
      await activateTab(tab);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function closeTab(tabId: string) {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const closedTab = tabs[index];
    const remaining = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remaining);

    try {
      await invoke("close_tab", { tabId });
      if (closedTab) {
        closedTabs.current = [...closedTabs.current.slice(-19), closedTab];
      }
      if (activeId === tabId) {
        const nextTab = remaining[Math.max(0, index - 1)];
        if (nextTab) {
          await activateTab(nextTab);
        } else {
          setActiveId(null);
          setAddress("");
          await createTab();
        }
      }
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function restoreLastTab() {
    const previousTab = closedTabs.current.pop();
    if (!previousTab) return;

    const restoredTab = { ...previousTab, id: String(nextId.current++) };
    setTabs((current) => [...current, restoredTab]);
    try {
      await activateTab(restoredTab);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function navigateTo(target: string) {
    if (!activeId) return;

    const url = isNewTabUrl(target) ? NEW_TAB_URL : target;
    const isInternal = isNewTabUrl(url);
    setAddress(isInternal ? "" : url);
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeId
          ? { ...tab, url, title: isInternal ? NEW_TAB_TITLE : fallbackTabTitle(url) }
          : tab,
      ),
    );
    setError("");
    try {
      await invoke(isInternal ? "open_tab" : "navigate_tab", { tabId: activeId, url });
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function navigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await navigateTo(resolveAddress(address));
  }

  async function runHistoryAction(action: "goBack" | "goForward" | "reload" | "stop") {
    if (!activeId) return;
    try {
      await invoke("history_tab", { tabId: activeId, action });
      if (action === "stop") {
        setLoadingByTab((current) => ({ ...current, [activeId]: false }));
      }
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  }

  shortcutActionsRef.current = {
    tabs,
    activeId,
    createTab,
    closeTab,
    restoreLastTab,
    runHistoryAction,
  };

  useEffect(() => {
    function runShortcut(shortcut: string, sourceTabId?: string) {
      const actions = shortcutActionsRef.current;
      if (!actions || (sourceTabId && sourceTabId !== actions.activeId)) return;

      switch (shortcut) {
        case "new-tab":
          void actions.createTab();
          break;
        case "close-tab":
          if (actions.activeId) void actions.closeTab(actions.activeId);
          break;
        case "restore-tab":
          void actions.restoreLastTab();
          break;
        case "reload":
          if (actions.activeId) {
            const active = actions.tabs.find((tab) => tab.id === actions.activeId);
            if (active && !isNewTabUrl(active.url)) {
              void actions.runHistoryAction("reload");
            }
          }
          break;
        case "focus-address":
          addressInputRef.current?.focus();
          addressInputRef.current?.select();
          break;
        case "toggle-scratchpad":
          setIsScratchpadOpen((open) => !open);
          break;
        case "toggle-gemini":
          setIsGeminiOpen((open) => !open);
          break;
        case "next-tab":
        case "previous-tab": {
          if (!actions.activeId || actions.tabs.length < 2) break;
          const currentIndex = actions.tabs.findIndex((tab) => tab.id === actions.activeId);
          const offset = shortcut === "next-tab" ? 1 : -1;
          const nextIndex = (currentIndex + offset + actions.tabs.length) % actions.tabs.length;
          const nextTab = actions.tabs[nextIndex];
          if (nextTab) void activateTab(nextTab).catch((reason) => setError(String(reason)));
          break;
        }
        default: {
          const tabIndex = shortcut.startsWith("tab-") ? Number(shortcut.slice(4)) : 0;
          if (tabIndex < 1 || tabIndex > 9 || actions.tabs.length === 0) break;
          const tab = actions.tabs[tabIndex === 9 ? actions.tabs.length - 1 : tabIndex - 1];
          if (tab) void activateTab(tab).catch((reason) => setError(String(reason)));
        }
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      let shortcut: string | undefined;

      if (modifier && event.shiftKey && key === "t") shortcut = "restore-tab";
      else if (modifier && !event.shiftKey && key === "t") shortcut = "new-tab";
      else if (modifier && !event.shiftKey && key === "w") shortcut = "close-tab";
      else if ((event.key === "F5" && !modifier) || (modifier && !event.shiftKey && key === "r")) {
        shortcut = "reload";
      } else if (event.key === "F6" && !modifier) shortcut = "focus-address";
      else if (
        event.key === '"' &&
        !(
          event.target instanceof Element &&
          event.target.closest('input, textarea, [contenteditable="true"]')
        )
      ) {
        shortcut = "toggle-scratchpad";
      } else if (event.altKey && !modifier && !event.shiftKey && key === "g") {
        shortcut = "toggle-gemini";
      } else if (modifier && key === "tab") {
        shortcut = event.shiftKey ? "previous-tab" : "next-tab";
      } else if (modifier && !event.shiftKey && /^[1-9]$/.test(event.key)) {
        shortcut = `tab-${event.key}`;
      }

      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      runShortcut(shortcut);
    }

    window.addEventListener("keydown", onKeyDown, true);
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<BrowserShortcut>("browser-shortcut", (event) => {
      runShortcut(event.payload.shortcut, event.payload.tabId);
    })
      .then((stopListening) => {
        if (cancelled) stopListening();
        else unlisten = stopListening;
      })
      .catch((reason) => setError(String(reason)));

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown, true);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlistenLoad: (() => void) | undefined;
    let unlistenTitle: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const stopLoadListener = await listen<string>("tab-load-state", (event) => {
        const [tabId, loading] = event.payload.split("|");
        if (!tabId) return;
        setLoadingByTab((current) => ({ ...current, [tabId]: loading === "true" }));
      });
      if (cancelled) {
        stopLoadListener();
        return;
      }
      unlistenLoad = stopLoadListener;

      const stopTitleListener = await listen<TabTitleUpdate>("tab-title-updated", (event) => {
        const { tabId, title } = event.payload;
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId
              ? { ...tab, title: title.trim() || fallbackTabTitle(tab.url) }
              : tab,
          ),
        );
      });
      if (cancelled) {
        stopTitleListener();
        return;
      }
      unlistenTitle = stopTitleListener;
      if (!cancelled) {
        void createTab();
      }
    })().catch((reason) => setError(String(reason)));

    return () => {
      cancelled = true;
      unlistenLoad?.();
      unlistenTitle?.();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !activeId) return;

    const currentWindow = getCurrentWindow();
    const syncBounds = async () => {
      try {
        const rect = viewport.getBoundingClientRect();
        const [innerSize, scaleFactor] = await Promise.all([
          currentWindow.innerSize(),
          currentWindow.scaleFactor(),
        ]);
        const viewportWidth = rect.width > 0 ? rect.width : innerSize.width / scaleFactor;
        const height = Math.max(1, innerSize.height / scaleFactor - 84);
        const leftOffset = isGeminiOpen ? GEMINI_PANEL_WIDTH : 0;
        const rightOffset = isScratchpadOpen ? SCRATCHPAD_WIDTH : 0;
        const width = Math.max(200, viewportWidth - leftOffset - rightOffset);
        await invoke("sync_active_webview_bounds", {
          x: leftOffset,
          y: 84,
          width,
          height,
          scratchpadOpen: isScratchpadOpen,
          geminiOpen: isGeminiOpen,
        });
        await invoke("toggle_gemini_panel", {
          visible: isGeminiOpen,
          x: 0,
          y: 84,
          width: GEMINI_PANEL_WIDTH,
          height,
        });
      } catch (reason) {
        setError(String(reason));
      }
    };

    const observer = new ResizeObserver(() => void syncBounds());
    observer.observe(viewport);
    let unlistenResize: (() => void) | undefined;
    let cancelled = false;
    void currentWindow
      .onResized(() => void syncBounds())
      .then((stopListening) => {
        if (cancelled) {
          stopListening();
        } else {
          unlistenResize = stopListening;
        }
      })
      .catch((reason) => setError(String(reason)));
    void syncBounds();

    return () => {
      cancelled = true;
      unlistenResize?.();
      observer.disconnect();
    };
  }, [activeId, activeIsNewTab, isScratchpadOpen, isGeminiOpen]);

  async function reloadGemini() {
    try {
      await invoke("reload_gemini_panel");
    } catch (reason) {
      setError(String(reason));
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--bg-shell)] text-[var(--text-primary)]">
      <header className="flex h-[84px] w-full shrink-0 flex-col overflow-hidden">
        <TitleTabBar
          tabs={tabs}
          activeId={activeId}
          onActivate={(tab) => void activateTab(tab).catch((reason) => setError(String(reason)))}
          onClose={(tabId) => void closeTab(tabId)}
          onCreate={() => void createTab()}
          onError={handleError}
        />
        <NavigationBar
          address={address}
          addressInputRef={addressInputRef}
          activeId={activeId}
          activeUrl={activeTab?.url ?? ""}
          isNewTab={activeIsNewTab}
          loading={activeLoading}
          scratchpadOpen={isScratchpadOpen}
          geminiOpen={isGeminiOpen}
          error={error}
          onAddressChange={setAddress}
          onSubmit={navigate}
          onHistoryAction={(action) => void runHistoryAction(action)}
          onToggleScratchpad={() => setIsScratchpadOpen((open) => !open)}
          onToggleGemini={() => setIsGeminiOpen((open) => !open)}
          onReloadGemini={() => void reloadGemini()}
          onError={handleError}
        />
        {activeTab && <span className="sr-only">{activeTab.title}</span>}
      </header>
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
        {activeIsNewTab && (
          <div
            className="h-full min-w-0"
            style={{
              marginLeft: isGeminiOpen ? `${GEMINI_PANEL_WIDTH}px` : 0,
              width: `max(0px, calc(100% - ${
                (isGeminiOpen ? GEMINI_PANEL_WIDTH : 0) +
                (isScratchpadOpen ? SCRATCHPAD_WIDTH : 0)
              }px))`,
            }}
          >
            <NewTabView onNavigate={(url) => void navigateTo(url)} onError={handleError} />
          </div>
        )}
      </div>
      {isScratchpadMounted && (
        <ScratchpadDrawer
          open={isScratchpadOpen}
          currentPage={activeTab ? { title: activeTab.title, url: activeTab.url } : null}
          onClose={() => setIsScratchpadOpen(false)}
          onError={handleError}
        />
      )}
    </div>
  );
}

export default App;
